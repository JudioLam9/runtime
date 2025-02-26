// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.

import type { EmscriptenModule, NativePointer } from "./emscripten";

export interface DotnetHostBuilder {
    withConfig(config: MonoConfig): DotnetHostBuilder
    withConfigSrc(configSrc: string): DotnetHostBuilder
    withApplicationArguments(...args: string[]): DotnetHostBuilder
    withEnvironmentVariable(name: string, value: string): DotnetHostBuilder
    withEnvironmentVariables(variables: { [i: string]: string; }): DotnetHostBuilder
    withVirtualWorkingDirectory(vfsPath: string): DotnetHostBuilder
    withDiagnosticTracing(enabled: boolean): DotnetHostBuilder
    withDebugging(level: number): DotnetHostBuilder
    withMainAssembly(mainAssemblyName: string): DotnetHostBuilder
    withApplicationArgumentsFromQuery(): DotnetHostBuilder
    withApplicationEnvironment(applicationEnvironment?: string): DotnetHostBuilder;
    withApplicationCulture(applicationCulture?: string): DotnetHostBuilder;

    /**
     * Overrides the built-in boot resource loading mechanism so that boot resources can be fetched
     * from a custom source, such as an external CDN.
     */
    withResourceLoader(loadBootResource?: LoadBootResourceCallback): DotnetHostBuilder;
    create(): Promise<RuntimeAPI>
    run(): Promise<number>
}

// when adding new fields, please consider if it should be impacting the snapshot hash. If not, please drop it in the snapshot getCacheKey()
export type MonoConfig = {
    /**
     * The subfolder containing managed assemblies and pdbs. This is relative to dotnet.js script.
     */
    assemblyRootFolder?: string,
    /**
     * A list of assets to load along with the runtime.
     */
    assets?: AssetEntry[],
    /**
     * Additional search locations for assets.
     */
    remoteSources?: string[], // Sources will be checked in sequential order until the asset is found. The string "./" indicates to load from the application directory (as with the files in assembly_list), and a fully-qualified URL like "https://example.com/" indicates that asset loads can be attempted from a remote server. Sources must end with a "/".
    /**
     * It will not fail the startup is .pdb files can't be downloaded
     */
    ignorePdbLoadErrors?: boolean,
    /**
     * We are throttling parallel downloads in order to avoid net::ERR_INSUFFICIENT_RESOURCES on chrome. The default value is 16.
     */
    maxParallelDownloads?: number,
    /**
     * We are making up to 2 more delayed attempts to download same asset. Default true.
     */
    enableDownloadRetry?: boolean,
    /**
     * Name of the assembly with main entrypoint
     */
    mainAssemblyName?: string,
    /**
     * Configures the runtime's globalization mode
     */
    globalizationMode?: GlobalizationMode,
    /**
     * debugLevel > 0 enables debugging and sets the debug log level to debugLevel
     * debugLevel == 0 disables debugging and enables interpreter optimizations
     * debugLevel < 0 enables debugging and disables debug logging.
     */
    debugLevel?: number,
    /**
    * Enables diagnostic log messages during startup
    */
    diagnosticTracing?: boolean
    /**
     * Dictionary-style Object containing environment variables
     */
    environmentVariables?: {
        [i: string]: string;
    },
    /**
     * initial number of workers to add to the emscripten pthread pool
     */
    pthreadPoolSize?: number,
    /**
     * If true, the snapshot of runtime's memory will be stored in the browser and used for faster startup next time. Default is false.
     */
    startupMemoryCache?: boolean,
    /**
     * hash of assets
     */
    assetsHash?: string,
    /**
     * application environment
     */
    applicationEnvironment?: string,

    /**
     * Gets the application culture. This is a name specified in the BCP 47 format. See https://tools.ietf.org/html/bcp47
     */
    applicationCulture?: string,

    /**
     * definition of assets to load along with the runtime.
     */
    resources?: ResourceGroups;

    /**
     * config extensions declared in MSBuild items @(WasmBootConfigExtension)
     */
    extensions?: { [name: string]: any };
};

export type ResourceExtensions = { [extensionName: string]: ResourceList };

export interface ResourceGroups {
    readonly hash?: string;
    readonly assembly?: ResourceList; // nullable only temporarily
    readonly lazyAssembly?: ResourceList; // nullable only temporarily
    readonly pdb?: ResourceList;
    readonly runtime?: ResourceList; // nullable only temporarily
    readonly satelliteResources?: { [cultureName: string]: ResourceList };
    readonly libraryInitializers?: ResourceList,
    readonly libraryStartupModules?: {
        readonly onRuntimeConfigLoaded?: ResourceList,
        readonly onRuntimeReady?: ResourceList
    },
    readonly extensions?: ResourceExtensions
    readonly vfs?: { [virtualPath: string]: ResourceList };
}

export type ResourceList = { [name: string]: string };

/**
 * Overrides the built-in boot resource loading mechanism so that boot resources can be fetched
 * from a custom source, such as an external CDN.
 * @param type The type of the resource to be loaded.
 * @param name The name of the resource to be loaded.
 * @param defaultUri The URI from which the framework would fetch the resource by default. The URI may be relative or absolute.
 * @param integrity The integrity string representing the expected content in the response.
 * @returns A URI string or a Response promise to override the loading process, or null/undefined to allow the default loading behavior.
 */
export type LoadBootResourceCallback = (type: WebAssemblyBootResourceType, name: string, defaultUri: string, integrity: string) => string | Promise<Response> | null | undefined;

export interface ResourceRequest {
    name: string, // the name of the asset, including extension.
    behavior: AssetBehaviours, // determines how the asset will be handled once loaded
    resolvedUrl?: string; // this should be absolute url to the asset
    hash?: string;
}

export interface LoadingResource {
    name: string;
    url: string;
    response: Promise<Response>;
}

// Types of assets that can be in the _framework/blazor.boot.json file (taken from /src/tasks/WasmAppBuilder/WasmAppBuilder.cs)
export interface AssetEntry extends ResourceRequest {
    /**
     * If specified, overrides the path of the asset in the virtual filesystem and similar data structures once downloaded.
     */
    virtualPath?: string,
    /**
     * Culture code
     */
    culture?: string,
    /**
     * If true, an attempt will be made to load the asset from each location in MonoConfig.remoteSources.
     */
    loadRemote?: boolean, // 
    /**
     * If true, the runtime startup would not fail if the asset download was not successful.
     */
    isOptional?: boolean
    /**
     * If provided, runtime doesn't have to fetch the data. 
     * Runtime would set the buffer to null after instantiation to free the memory.
     */
    buffer?: ArrayBuffer
    /**
     * It's metadata + fetch-like Promise<Response>
     * If provided, the runtime doesn't have to initiate the download. It would just await the response.
     */
    pendingDownload?: LoadingResource
}

export type AssetBehaviours =
    /**
     * Load asset as a managed resource assembly.
     */
    "resource"
    /**
     * Load asset as a managed assembly.
     */
    | "assembly"
    /**
     * Load asset as a managed debugging information.
     */
    | "pdb"
    /**
     * Store asset into the native heap.
     */
    | "heap"
    /**
     * Load asset as an ICU data archive.
     */
    | "icu"
    /**
     * Load asset into the virtual filesystem (for fopen, File.Open, etc).
     */
    | "vfs"
    /**
     * The binary of the dotnet runtime.
     */
    | "dotnetwasm"
    /**
     * The javascript module for threads.
     */
    | "js-module-threads"
    /**
     * The javascript module for threads.
     */
    | "js-module-runtime"
    /**
     * The javascript module for threads.
     */
    | "js-module-dotnet"
    /**
     * The javascript module for threads.
     */
    | "js-module-native"
    /**
     * The javascript module that came from nuget package .
     */
    | "js-module-library-initializer"
    /**
     * The javascript module for threads.
     */
    | "symbols" // 

export const enum GlobalizationMode {
    /**
     * Load sharded ICU data.
     */
    Sharded = "sharded", // 
    /**
     * Load all ICU data.
     */
    All = "all",
    /**
     * Operate in invariant globalization mode.
     */
    Invariant = "invariant",
    /**
     * Use user defined icu file.
     */
    Custom = "custom",
    /**
     * Operate in hybrid globalization mode with small ICU files, using native platform functions.
     */
    Hybrid = "hybrid"
}

export type DotnetModuleConfig = {
    disableDotnet6Compatibility?: boolean,

    config?: MonoConfig,
    configSrc?: string,
    onConfigLoaded?: (config: MonoConfig) => void | Promise<void>;
    onDotnetReady?: () => void | Promise<void>;
    onDownloadResourceProgress?: (resourcesLoaded: number, totalResources: number) => void;
    getApplicationEnvironment?: (bootConfigResponse: Response) => string | null;

    imports?: any;
    exports?: string[];
    downloadResource?: (request: ResourceRequest) => LoadingResource | undefined
} & Partial<EmscriptenModule>

export type APIType = {
    runMain: (mainAssemblyName: string, args: string[]) => Promise<number>,
    runMainAndExit: (mainAssemblyName: string, args: string[]) => Promise<number>,
    setEnvironmentVariable: (name: string, value: string) => void,
    getAssemblyExports(assemblyName: string): Promise<any>,
    setModuleImports(moduleName: string, moduleImports: any): void,
    getConfig: () => MonoConfig,
    invokeLibraryInitializers: (functionName: string, args: any[]) => Promise<void>,

    // memory management
    setHeapB32: (offset: NativePointer, value: number | boolean) => void,
    setHeapU8: (offset: NativePointer, value: number) => void,
    setHeapU16: (offset: NativePointer, value: number) => void,
    setHeapU32: (offset: NativePointer, value: NativePointer | number) => void,
    setHeapI8: (offset: NativePointer, value: number) => void,
    setHeapI16: (offset: NativePointer, value: number) => void,
    setHeapI32: (offset: NativePointer, value: number) => void,
    setHeapI52: (offset: NativePointer, value: number) => void,
    setHeapU52: (offset: NativePointer, value: number) => void,
    setHeapI64Big: (offset: NativePointer, value: bigint) => void,
    setHeapF32: (offset: NativePointer, value: number) => void,
    setHeapF64: (offset: NativePointer, value: number) => void,
    getHeapB32: (offset: NativePointer) => boolean,
    getHeapU8: (offset: NativePointer) => number,
    getHeapU16: (offset: NativePointer) => number,
    getHeapU32: (offset: NativePointer) => number,
    getHeapI8: (offset: NativePointer) => number,
    getHeapI16: (offset: NativePointer) => number,
    getHeapI32: (offset: NativePointer) => number,
    getHeapI52: (offset: NativePointer) => number,
    getHeapU52: (offset: NativePointer) => number,
    getHeapI64Big: (offset: NativePointer) => bigint,
    getHeapF32: (offset: NativePointer) => number,
    getHeapF64: (offset: NativePointer) => number,
    localHeapViewI8: () => Int8Array,
    localHeapViewI16: () => Int16Array,
    localHeapViewI32: () => Int32Array,
    localHeapViewI64Big: () => BigInt64Array,
    localHeapViewU8: () => Uint8Array,
    localHeapViewU16: () => Uint16Array,
    localHeapViewU32: () => Uint32Array,
    localHeapViewF32: () => Float32Array,
    localHeapViewF64: () => Float64Array,
}

export type RuntimeAPI = {
    /**
     * @deprecated Please use API object instead. See also MONOType in dotnet-legacy.d.ts
     */
    MONO: any,
    /**
     * @deprecated Please use API object instead. See also BINDINGType in dotnet-legacy.d.ts
     */
    BINDING: any,
    INTERNAL: any,
    Module: EmscriptenModule,
    runtimeId: number,
    runtimeBuildInfo: {
        productVersion: string,
        gitHash: string,
        buildConfiguration: string,
    }
} & APIType

export type ModuleAPI = {
    dotnet: DotnetHostBuilder;
    exit: (code: number, reason?: any) => void
}

export type CreateDotnetRuntimeType = (moduleFactory: DotnetModuleConfig | ((api: RuntimeAPI) => DotnetModuleConfig)) => Promise<RuntimeAPI>;

export interface WebAssemblyStartOptions {
    /**
     * Overrides the built-in boot resource loading mechanism so that boot resources can be fetched
     * from a custom source, such as an external CDN.
     * @param type The type of the resource to be loaded.
     * @param name The name of the resource to be loaded.
     * @param defaultUri The URI from which the framework would fetch the resource by default. The URI may be relative or absolute.
     * @param integrity The integrity string representing the expected content in the response.
     * @returns A URI string or a Response promise to override the loading process, or null/undefined to allow the default loading behavior.
     */
    loadBootResource(type: WebAssemblyBootResourceType, name: string, defaultUri: string, integrity: string): string | Promise<Response> | null | undefined;

    /**
     * Override built-in environment setting on start.
     */
    environment?: string;

    /**
     * Gets the application culture. This is a name specified in the BCP 47 format. See https://tools.ietf.org/html/bcp47
     */
    applicationCulture?: string;
}

// This type doesn't have to align with anything in BootConfig.
// Instead, this represents the public API through which certain aspects
// of boot resource loading can be customized.
export type WebAssemblyBootResourceType = "assembly" | "pdb" | "dotnetjs" | "dotnetwasm" | "globalization" | "manifest" | "configuration";