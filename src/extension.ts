import * as vscode from 'vscode';
import { showConfigWebview } from './configWebview';

import { onConfigChange } from './config';
import { outputChannel } from './outputChannel';
import { TaskManager } from './taskManager';
import { disposeTerminalManager, getTerminalManager } from './terminalManager';

// Extension version
const EXTENSION_VERSION = '1.1.4';

// Create a global task manager instance
const taskManager = new TaskManager();
let statusBarItem: vscode.StatusBarItem | undefined;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext)
{
    console.log(`Cpp Runner Pro v${EXTENSION_VERSION} is now active!`);

    // 预创建编译终端，确保它在终端列表最前面
    getTerminalManager().preCreateCompileTerminal();

    // Legacy initialization/cleanup removed; no-op

    // Migration: move first matching entries from deprecated compilers array into new gcc/clang settings if empty
    (async () =>
    {
        try
        {
            const cfg = vscode.workspace.getConfiguration('cpp-runner-pro');
            const legacyCompilers: any[] = cfg.get<any[]>('compilers') || [];
            const gccObj = cfg.get<any>('gcc');
            const clangObj = cfg.get<any>('clang');
            if (legacyCompilers.length)
            {
                const gccLike = legacyCompilers.find(c => /g\+\+|gcc/i.test(c.name));
                const clangLike = legacyCompilers.find(c => /clang\+\+|clang/i.test(c.name));
                if (!gccObj && gccLike)
                {
                    const migrated = {
                        path: gccLike.path || undefined,
                        cpp_path: gccLike.path || undefined,
                        debug_options: (gccLike.buildModes?.debug || '-O0 -g').split(/\s+/).filter(Boolean),
                        release_options: (gccLike.buildModes?.release || '-O3 -DNDEBUG').split(/\s+/).filter(Boolean),
                        warnings_options: (gccLike.options_base || '').match(/-Wall|-Wextra/) ? gccLike.options_base.split(/\s+/).filter(Boolean) : ['-Wall', '-Wextra'],
                        sanitizers: gccLike.sanitizers || [],
                        sanitizers_options: gccLike.sanitizersModes || ['debug']
                    };
                    await cfg.update('gcc', migrated, vscode.ConfigurationTarget.Workspace);
                }
                if (!clangObj && clangLike)
                {
                    const migrated = {
                        path: clangLike.path || undefined,
                        cpp_path: clangLike.path || undefined,
                        debug_options: (clangLike.buildModes?.debug || '-O0 -g').split(/\s+/).filter(Boolean),
                        release_options: (clangLike.buildModes?.release || '-O3 -DNDEBUG').split(/\s+/).filter(Boolean),
                        warnings_options: (clangLike.options_base || '').match(/-Wall|-Wextra/) ? clangLike.options_base.split(/\s+/).filter(Boolean) : ['-Wall', '-Wextra'],
                        sanitizers: clangLike.sanitizers || [],
                        sanitizers_options: clangLike.sanitizersModes || ['debug']
                    };
                    await cfg.update('clang', migrated, vscode.ConfigurationTarget.Workspace);
                }
            }
        } catch (err)
        {
            console.warn('Migration error (non-fatal):', err);
        }
    })();

    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    statusBarItem.text = 'C++ Runner';
    statusBarItem.command = 'cpp-runner-pro.showConfigWebview';
    statusBarItem.show();

    // Register commands
    const runCommand = vscode.commands.registerCommand('cpp-runner-pro.run', () =>
    {
        const filePath = vscode.window.activeTextEditor?.document.fileName || '';
        if (!filePath) { return; }
        taskManager.compileAndRunCppFile();
    });

    const showConfigCommand = vscode.commands.registerCommand('cpp-runner-pro.showConfigWebview', () =>
    {
        showConfigWebview();
    });

    const projectConfigCommand = vscode.commands.registerCommand('cpp-runner-pro.projectConfig', () =>
    {
        showConfigWebview();
    });

    // 仅编译命令
    const compileCommand = vscode.commands.registerCommand('cpp-runner-pro.compile', () =>
    {
        taskManager.compileCppFile();
    });

    // 显示编译终端
    const showCompileTerminalCommand = vscode.commands.registerCommand('cpp-runner-pro.showCompileTerminal', () =>
    {
        taskManager.showCompileTerminal();
    });

    // 显示运行终端选择器
    const showRunTerminalsCommand = vscode.commands.registerCommand('cpp-runner-pro.showRunTerminals', () =>
    {
        taskManager.showRunTerminalPicker();
    });

    // 关闭所有终端
    const closeAllTerminalsCommand = vscode.commands.registerCommand('cpp-runner-pro.closeAllTerminals', () =>
    {
        taskManager.closeAllTerminals();
    });

    // Register config change listener
    const configChangeListener = vscode.workspace.onDidChangeConfiguration(onConfigChange);

    context.subscriptions.push(
        runCommand,
        showConfigCommand,
        projectConfigCommand,
        compileCommand,
        showCompileTerminalCommand,
        showRunTerminalsCommand,
        closeAllTerminalsCommand,
        configChangeListener,
        taskManager,
        outputChannel,
        statusBarItem,
    );
}

export function deactivate()
{
    disposeTerminalManager();
}
