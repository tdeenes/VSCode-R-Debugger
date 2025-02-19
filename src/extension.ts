
import * as vscode from 'vscode';
import { WorkspaceFolder, ProviderResult, CancellationToken, DebugConfigurationProviderTriggerKind } from 'vscode';
import { DebugAdapter } from './debugAdapter';
import {
	DebugMode, FunctionDebugConfiguration,
	FileDebugConfiguration, WorkspaceDebugConfiguration,
	StrictDebugConfiguration,
	AttachConfiguration
} from './debugProtocolModifications';
import { updateRPackage } from './installRPackage';
import { trackTerminals, TerminalHandler } from './terminals';

import { RExtension, HelpPanel } from './rExtensionApi';

import { checkSettings } from './utils';

import { DebugWindowCommandArg, showDataViewer } from './commands';

import * as fs from 'fs';
import * as path from 'path';


// this method is called when the extension is activated
export async function activate(context: vscode.ExtensionContext) {
	
	if(context.globalState.get<boolean>('ignoreDeprecatedConfig', false) !== true){
		checkSettings().then((ret) => {
			context.globalState.update('ignoreDeprecatedConfig', ret);
		});
	}
	
	const rExtension = vscode.extensions.getExtension<RExtension>('ikuyadeu.r');

	let rHelpPanel: HelpPanel = undefined;

	if(rExtension){
		const api = await rExtension.activate();
		if(api){
			rHelpPanel = api.helpPanel;
		}
	}

	const supportsHelpViewer = !!rHelpPanel;

	const terminalHandler = new TerminalHandler();
	const port = await terminalHandler.portPromise;

	context.subscriptions.push(terminalHandler);

	// register configuration resolver
	const resolver = new DebugConfigurationResolver(port, 'localhost', supportsHelpViewer);
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('R-Debugger', resolver));

	// register dynamic configuration provider
	const dynamicProvider = new DynamicDebugConfigurationProvider();
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('R-Debugger', dynamicProvider, DebugConfigurationProviderTriggerKind.Dynamic));

	// register initial configuration provider
	const initialProvider = new InitialDebugConfigurationProvider();
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('R-Debugger', initialProvider, DebugConfigurationProviderTriggerKind.Initial));

	// register the debug adapter descriptor provider
    const factory = new DebugAdapterDescriptorFactory(rHelpPanel);
	context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('R-Debugger', factory));

	if(vscode.workspace.getConfiguration('r.debugger').get<boolean>('trackTerminals', false)){
		trackTerminals(context.environmentVariableCollection);
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('r.debugger.updateRPackage', () => updateRPackage(context.extensionPath)),
		vscode.commands.registerCommand('r.debugger.showDataViewer', (arg: DebugWindowCommandArg) => {
			showDataViewer(arg);
		})
	);
}

// this method is called when the extension is deactivated
export function deactivate() {}

class DebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
	helpPanel?: HelpPanel;

	constructor(helpPanel?: HelpPanel){
		this.helpPanel = helpPanel;
	}
	createDebugAdapterDescriptor(session: vscode.DebugSession): ProviderResult<vscode.DebugAdapterDescriptor> {
		const config = session.configuration;
		if(config.request === 'launch'){
			const commandLineArgs = [];
			if('commandLineArgs' in config){
				commandLineArgs.push(...config.commandLineArgs);
			}
			return new vscode.DebugAdapterInlineImplementation(new DebugAdapter(this.helpPanel, commandLineArgs));
		} else if(config.request === 'attach'){
			const port: number = config.port || 18721;
			const host: string = config.host || 'localhost';
			return new vscode.DebugAdapterServer(port, host);
		} else{
			throw new Error('Invalid entry "request" in debug config. Valid entries are "launch" and "attach"');
		}
	}
}


class InitialDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
	provideDebugConfigurations(folder: WorkspaceFolder | undefined): ProviderResult<StrictDebugConfiguration[]>{
		return [
			{
				type: "R-Debugger",
				name: "Launch R-Workspace",
				request: "launch",
				debugMode: "workspace",
				workingDirectory: "${workspaceFolder}"
			},
			{
				type: "R-Debugger",
				name: "Debug R-File",
				request: "launch",
				debugMode: "file",
				workingDirectory: "${workspaceFolder}",
				file: "${file}"
			},
			{
				type: "R-Debugger",
				name: "Debug R-Function",
				request: "launch",
				debugMode: "function",
				workingDirectory: "${workspaceFolder}",
				file: "${file}",
				mainFunction: "main",
				allowGlobalDebugging: false
			},
			{
				type: "R-Debugger",
				name: "Debug R-Package",
				request: "launch",
				debugMode: "workspace",
				workingDirectory: "${workspaceFolder}",
				includePackageScopes: true,
				loadPackages: ["."]
			},
			{
				type: "R-Debugger",
				request: "attach",
				name: "Attach to R process",
				splitOverwrittenOutput: true
			}
		];
	}
}

class DynamicDebugConfigurationProvider implements vscode.DebugConfigurationProvider {

	provideDebugConfigurations(folder: WorkspaceFolder | undefined): ProviderResult<StrictDebugConfiguration[]>{

		const doc = vscode.window.activeTextEditor;
		const docValid = doc && doc.document.uri.scheme === 'file';
		const wd = (folder ? '${workspaceFolder}' : (docValid ? '${fileDirname}' : '.'));

		const hasDescription = folder && fs.existsSync(path.join(folder.uri.fsPath, 'DESCRIPTION'));

		let configs: StrictDebugConfiguration[] = [];

		configs.push({
            type: "R-Debugger",
            request: "launch",
            name: "Launch R-Workspace",
            debugMode: "workspace",
            workingDirectory: wd,
            allowGlobalDebugging: true
		});

		if(docValid){
			configs.push({
				type: "R-Debugger",
				request: "launch",
				name: "Debug R-File",
				debugMode: "file",
				workingDirectory: wd,
				file: "${file}",
				allowGlobalDebugging: true
			});

			configs.push({
				type: "R-Debugger",
				request: "launch",
				name: "Debug R-Function",
				debugMode: "function",
				workingDirectory: wd,
				file: "${file}",
				mainFunction: "main",
				allowGlobalDebugging: false
			});
		};

		if(hasDescription){
			configs.push({
				type: "R-Debugger",
				name: "Debug R-Package",
				request: "launch",
				debugMode: "workspace",
				workingDirectory: wd,
				loadPackages: ["."],
				includePackageScopes: true,
				allowGlobalDebugging: true
			});
		}

		configs.push({
            type: "R-Debugger",
            request: "attach",
            name: "Attach to R process",
            splitOverwrittenOutput: true
		});

		return configs;
	}
}

class DebugConfigurationResolver implements vscode.DebugConfigurationProvider {

	readonly customPort: number;
	readonly customHost: string;
	readonly supportsHelpViewer: boolean;

	constructor(customPort: number, customHost: string = 'localhost', supportsHelpViewer: boolean = false) {
		this.customPort = customPort;
		this.customHost = customHost;
		this.supportsHelpViewer = supportsHelpViewer;
	}

	resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: vscode.DebugConfiguration, token?: CancellationToken): ProviderResult<StrictDebugConfiguration> {

		let strictConfig: StrictDebugConfiguration|null = null;

		const doc = vscode.window.activeTextEditor;
		const docValid = doc && doc.document.uri.scheme === 'file';
		const wd = (folder ? '${workspaceFolder}' : (docValid ? '${fileDirname}' : '.'));

		const hasDescription = folder && fs.existsSync(path.join(folder.uri.fsPath, 'DESCRIPTION'));

		// if the debugger was launched without config
		if (!config.type && !config.request && !config.name) {
			if(hasDescription){
				config = {
					type: "R-Debugger",
					name: "Debug R-Package",
					request: "launch",
					debugMode: "workspace",
					workingDirectory: wd,
					loadPackages: ["."],
					includePackageScopes: true,
					allowGlobalDebugging: true
				};
			} else if(docValid){
				// if file is open, debug file
				config = {
					type: "R-Debugger",
					name: "Launch R Debugger",
					request: "launch",
					debugMode: "file",
					file: "${file}",
					workingDirectory: wd
				};
			} else{
				// if folder but no file is open, launch workspace
				config = {
					type: "R-Debugger",
					name: "Launch R Debugger",
					request: "launch",
					debugMode: "workspace",
					workingDirectory: wd
				};
			}
		}

		config.debugMode = config.debugMode || (docValid ? "file" : "workspace");
		config.allowGlobalDebugging = config.allowGlobalDebugging ?? true;

		// fill custom capabilities/socket info
		if(config.request === 'launch'){
			// capabilities that are always true for this extension:
			config.supportsStdoutReading = true;
			config.supportsWriteToStdinEvent = true;
			config.supportsShowingPromptRequest = true;
			// set to true if not specified. necessary since its default in vscDebugger is FALSE:
			config.overwriteHelp = config.overwriteHelp ?? true; 
			config.overwriteHelp =  config.overwriteHelp && this.supportsHelpViewer; // check if helpview available
		} else if (config.request === 'attach'){
			// communication info with TerminalHandler():
			config.customPort = config.customPort ?? this.customPort;
			config.customHost = config.customHost || this.customHost;
			config.useCustomSocket = config.useCustomSocket ?? true;
			config.supportsWriteToStdinEvent = config.supportsWriteToStdinEvent ?? true;
			config.overwriteLoadAll = false;
		}

		// make sure the config matches the requirements of one of the debug modes
		const debugMode: DebugMode|undefined = config.debugMode;
		if(config.request === 'attach'){
			// no fields mandatory
			strictConfig = <AttachConfiguration>config;
		} else if(debugMode === "function"){
			// make sure that all required fields (workingDirectory, file, function) are filled:
			config.workingDirectory = config.workingDirectory || wd;
			config.file = config.file || '${file}';
			config.mainFunction = config.mainFunction || 'main';
			strictConfig = <FunctionDebugConfiguration>config;
		} else if(debugMode === "file"){
			// make sure that all required fields (workingDirectory, file) are filled:
			config.workingDirectory = config.workingDirectory || wd;
			config.file = config.file || '${file}';
			strictConfig = <FileDebugConfiguration>config;
		} else if(debugMode === "workspace"){
			// make sure that all required fields (workingDirectory) are filled:
			config.workingDirectory = config.workingDirectory || wd;
			strictConfig = <WorkspaceDebugConfiguration>config;
		} else{
			strictConfig = null;
		}
		return strictConfig;
	}
}
