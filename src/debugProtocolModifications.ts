

import { DebugProtocol } from 'vscode-debugprotocol';
// @ts-ignore
import * as VsCode from 'vscode';
// import { DebugProtocol } from './debugProtocol';


//
// Regular extension of the DAP:
//

export type DebugMode = "function"|"file"|"workspace";

export interface RStartupArguments {
    path: string;
    args: string[];
    jsonPort?: number;
    sinkPort?: number;
    cwd: string;
}

export interface DebugConfiguration extends VsCode.DebugConfiguration {
    type: "R-Debugger";
    request: "launch"|"attach";

    // specify how/where to debug (some required, depends on request/debugMode)
    debugMode?: DebugMode;
    workingDirectory?: string;
    file?: string;
    mainFunction?: string;

    // specify how to debug (optional)
    includePackageScopes?: boolean;
    setBreakpointsInPackages?: boolean;
    debuggedPackages?: string[];
    loadPackages?: string[];
    assignToAns?: boolean;
    allowGlobalDebugging?: boolean;

    overwritePrint?: boolean;
    overwriteCat?: boolean;
    overwriteMessage?: boolean;
    overwriteStr?: boolean;
    overwriteSource?: boolean;
    overwriteLoadAll?: boolean;
    overwriteHelp?: boolean;
    splitOverwrittenOutput?: boolean;

    // custom events/requests/capabilities:
    supportsWriteToStdinEvent?: boolean;
    supportsShowingPromptRequest?: boolean;
    supportsStdoutReading?: boolean;
    supportsHelpViewer?: boolean;
    ignoreFlowControl?: boolean;

    useCustomSocket?: boolean;
    customPort?: number;
    customHost?: string;
}

export interface LaunchConfiguration extends DebugConfiguration {
    request: "launch";
    commandLineArgs?: string[];
}

export interface FunctionDebugConfiguration extends LaunchConfiguration {
    debugMode: "function";
    workingDirectory: string;
    file: string;
    mainFunction: string;
}
export interface FileDebugConfiguration extends LaunchConfiguration {
    debugMode: "file";
    workingDirectory: string;
    file: string;
}
export interface WorkspaceDebugConfiguration extends LaunchConfiguration {
    debugMode: "workspace";
    workingDirectory: string;
}

export interface AttachConfiguration extends DebugConfiguration {
    request: "attach";
    port?: number; //default = 18721
    host?: string;
}

export type StrictDebugConfiguration = FunctionDebugConfiguration | FileDebugConfiguration | WorkspaceDebugConfiguration | AttachConfiguration;

export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments, DebugConfiguration {
}

export interface RStrings {
    prompt?: string;
    continue?: string;
    startup?: string;
    libraryNotFound?: string;
    packageName?: string;
}




//
// Non standard extension/modification of the DAP:
// 

export interface InitializeRequest extends DebugProtocol.InitializeRequest {
    arguments: InitializeRequestArguments;
}
export interface InitializeRequestArguments extends DebugProtocol.InitializeRequestArguments {
    rStrings?: RStrings;
    threadId?: number;
    useJsonSocket?: boolean;
    jsonPort?: number;
    jsonHost?: string;
    useSinkSocket?: boolean;
    sinkPort?: number;
    sinkHost?: string;
    extensionVersion?: string;
}

export interface InitializeResponse extends DebugProtocol.InitializeResponse {
    packageInfo?: PackageInfo;
}
export interface PackageInfo {
    Package: string;
    Version: string;
};

export interface ContinueRequest extends DebugProtocol.ContinueRequest {
    arguments: ContinueArguments;
}
export interface ContinueArguments extends DebugProtocol.ContinueArguments {
    callDebugSource?: boolean;
    source?: DebugProtocol.Source;
}


export interface ResponseWithBody extends DebugProtocol.Response {
    body?: { [key: string]: any; };
}

// Used to send info to VS Code that is not part of the DAP
export interface CustomEvent extends DebugProtocol.Event {
    event: "custom";
    body: {
        reason: string;
    }
}

// Request help panel
export interface ViewHelpEvent extends CustomEvent {
    body: ViewHelpBody;
}
export interface ViewHelpBody {
    reason: "viewHelp";
    requestPath: string;
}

// Indicate that VS-Code should write a given text to R's stdin
export interface WriteToStdinEvent extends CustomEvent {
    body: WriteToStdinBody;
}
export interface WriteToStdinBody {
    reason: "writeToStdin";
    text: string;
    when?: "now"|"browserPrompt"|"topLevelPrompt"|"prompt";
    fallBackToNow?: boolean;
    addNewLine?: boolean; //=false (in vscode), =true (in R)
    count?: number; // =1
    stack?: boolean;
    // info used to identify the correct terminal:
    terminalId?: string;
    useActiveTerminal?: boolean;
    pid?: number;
    ppid?: number;
}

// Used to send info to R that is not part of the DAP
export interface CustomRequest extends DebugProtocol.Request {
    command: "custom"
    arguments: {
        reason: string;
    }
}

// Indicate that R is showing the input prompt in its stdout
export interface ShowingPromptRequest extends CustomRequest {
    arguments: {
        reason: "showingPrompt";
        which?: "browser"|"topLevel";
        text?: string;
    }
}

// Tell R to show the data viewer for a variable
export interface ShowDataViewerRequest extends CustomRequest {
    arguments: ShowDataViewerArguments;
}

export interface ShowDataViewerArguments {
    reason: "showDataViewer";
    /** The reference of the variable container. */
    variablesReference: number;
    /** The name of the variable in the container. */
    name: string;
}
