import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { buildMode, compileCmd as globalCompileCmd, outputDirectory, programArgs } from './config';
import { getTerminalManager, TerminalManager } from './terminalManager';
import { outputChannel } from './outputChannel';

async function computeExePath(filePath: string, workspaceFolder: vscode.WorkspaceFolder): Promise<{ exePath: string; buildDir: string; exeName: string }> {
    const outDir = outputDirectory.replace('${mode}', buildMode);
    const buildDir = path.join(workspaceFolder.uri.fsPath, outDir);
    try { await fs.promises.mkdir(buildDir, { recursive: true }); } catch { }
    const exeNameBase = filePath.replace(/\\/g, '/').split('/').pop()?.replace(/\.(c|cpp|cc|cxx)$/i, '') || 'a.out';
    const exeName = exeNameBase + (process.platform === 'win32' ? '.exe' : '');
    const exePath = path.join(buildDir, exeName);
    return { exePath, buildDir, exeName };
}

/**
 * 任务管理器
 * 
 * 使用持久化终端执行编译和运行：
 * - 编译终端：共享终端，所有编译任务在此执行
 * - 运行终端：每个运行任务独立终端，支持同时运行多个
 * - 终端由用户手动管理，不会自动关闭
 * - 使用 Shell Integration API 获取命令退出码
 */
export class TaskManager {
    private terminalManager: TerminalManager;
    private isCompiling = false;
    private compileQueue: (() => Promise<void>)[] = [];
    /** 缓存源代码文件的修改时间，用于判断是否需要重新编译 */
    private sourceMtimeCache: Map<string, number> = new Map();

    constructor() {
        this.terminalManager = getTerminalManager();
    }

    /**
     * 编译并运行 C++ 文件
     */
    public async compileAndRunCppFile(): Promise<void> {
        // 如果正在编译，将请求加入队列
        if (this.isCompiling) {
            outputChannel.info('Compilation in progress, queuing this request...');
            return new Promise((resolve) => {
                this.compileQueue.push(async () => {
                    await this._compileAndRunCppFile();
                    resolve();
                });
            });
        }

        await this._compileAndRunCppFile();
    }

    private async _compileAndRunCppFile(): Promise<void> {
        this.isCompiling = true;
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                outputChannel.error('No active editor');
                return;
            }

            const document = editor.document;

            if (document.isUntitled) {
                outputChannel.error('Please save the file first before compiling.');
                return;
            }

            const filePath = document.fileName;
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            if (!workspaceFolder) {
                outputChannel.error('File not in workspace');
                return;
            }

            const vsconfig = vscode.workspace.getConfiguration('cpp-runner-pro');

            const ext = path.extname(filePath).toLowerCase();
            const skipExts = (vsconfig.get<string[]>('skipExtensions') || ['.h', '.hpp', '.hh', '.hxx', '.inl']).map(s => s.toLowerCase());
            if (skipExts.includes(ext)) {
                outputChannel.info(`Skipped: files with extension '${ext}' are configured to be ignored.`);
                return;
            }

            const { exePath: exe } = await computeExePath(filePath, workspaceFolder);

            const compileCmd = globalCompileCmd
                .replace('${file}', `"${filePath}"`)
                .replace('${out}', `"${exe}"`);

            // 检查是否需要编译
            // 逻辑：比较源代码文件的修改时间，如果比缓存的新则需要重新编译
            // 如果可执行文件不存在，也需要重新编译
            let needCompile = true;
            let currentSourceMtime: number | undefined;
            try {
                const sourceStat = fs.statSync(filePath);
                currentSourceMtime = sourceStat.mtimeMs;
                const cachedMtime = this.sourceMtimeCache.get(filePath);
                // 如果可执行文件存在，且源代码文件 mtime 没有更新，则跳过编译
                if (fs.existsSync(exe) && cachedMtime !== undefined && currentSourceMtime <= cachedMtime) {
                    needCompile = false;
                }
            } catch { }

            // 如果需要编译，执行编译并等待完成
            if (needCompile) {
                outputChannel.info(`Compiling: ${path.basename(filePath)}`);
                const result = await this.terminalManager.executeInCompileTerminal(
                    compileCmd,
                    workspaceFolder.uri.fsPath
                );

                // 检查编译结果
                if (result.exitCode !== 0) {
                    outputChannel.error(`Compilation failed (exit code: ${result.exitCode})`);
                    return;
                }

                outputChannel.info('Compilation succeeded.');

                // 更新缓存：记录编译成功时源代码文件的 mtime
                if (currentSourceMtime !== undefined) {
                    this.sourceMtimeCache.set(filePath, currentSourceMtime);
                }
            }

            // 执行运行
            await this.executeRun(exe, workspaceFolder.uri.fsPath);
        } finally {
            // 编译完成，处理队列中的下一个请求
            this.isCompiling = false;
            const next = this.compileQueue.shift();
            if (next) {
                next();
            }
        }
    }

    /**
     * 执行运行
     */
    private async executeRun(exePath: string, cwd: string): Promise<void> {
        // 构建运行命令
        const args = programArgs || [];
        let runCmd: string;
        if (args.length > 0) {
            const argsStr = args.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' ');
            runCmd = `"${exePath}" ${argsStr}`;
        } else {
            runCmd = `"${exePath}"`;
        }

        // 检查是否有正在运行的终端
        const runningTerminals = this.terminalManager.getRunningTerminals(exePath);
        if (runningTerminals.length > 0) {
            const pick = await vscode.window.showQuickPick(
                [
                    { label: '$(terminal) Switch to existing terminal', value: 'switch' },
                    { label: '$(add) Create new terminal', value: 'new' },
                    { label: '$(refresh) Close existing and create new', value: 'restart' },
                    { label: '$(trash) Close all terminals for this executable', value: 'close' },
                ],
                {
                    placeHolder: `"${path.basename(exePath)}" is running in ${runningTerminals.length} terminal(s)`,
                }
            );

            if (!pick) { return; }

            switch (pick.value) {
                case 'switch':
                    this.terminalManager.showRunTerminal(exePath);
                    return;
                case 'restart':
                    this.terminalManager.closeRunTerminals(exePath);
                    break;
                case 'close':
                    this.terminalManager.closeRunTerminals(exePath);
                    outputChannel.info(`Closed all terminals for ${path.basename(exePath)}`);
                    return;
                case 'new':
                    break;
            }
        } else {
            // 没有正在运行的终端，检查是否有空闲终端可复用
            const reused = await this.terminalManager.executeInIdleTerminal(exePath, runCmd);
            if (reused) {
                outputChannel.info(`Reused terminal: ${reused.taskName}`);
                return;
            }
        }

        // 创建新运行终端
        const taskInfo = await this.terminalManager.executeInNewTerminal(exePath, runCmd, cwd);
        outputChannel.info(`Started: ${taskInfo.taskName}`);
    }

    /**
     * 仅编译（不运行）
     */
    public async compileCppFile(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            outputChannel.error('No active editor');
            return;
        }

        const document = editor.document;
        if (document.isUntitled) {
            outputChannel.error('Please save the file first before compiling.');
            return;
        }

        const filePath = document.fileName;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            outputChannel.error('File not in workspace');
            return;
        }

        const { exePath: exe } = await computeExePath(filePath, workspaceFolder);

        const compileCmd = globalCompileCmd
            .replace('${file}', `"${filePath}"`)
            .replace('${out}', `"${exe}"`);

        outputChannel.info(`Compiling: ${path.basename(filePath)}`);
        const result = await this.terminalManager.executeInCompileTerminal(
            compileCmd,
            workspaceFolder.uri.fsPath
        );

        if (result.exitCode === 0) {
            outputChannel.info('Compilation succeeded.');
            // 更新缓存：记录编译成功时源代码文件的 mtime
            try {
                const sourceStat = fs.statSync(filePath);
                this.sourceMtimeCache.set(filePath, sourceStat.mtimeMs);
            } catch { }
        } else {
            outputChannel.error(`Compilation failed (exit code: ${result.exitCode}).`);
        }
    }

    /**
     * 显示编译终端
     */
    public showCompileTerminal(): void {
        if (!this.terminalManager.showCompileTerminal()) {
            outputChannel.info('No compile terminal. Run a compile first.');
        }
    }

    /**
     * 显示运行终端选择器
     */
    public async showRunTerminalPicker(): Promise<void> {
        const allTasks = this.terminalManager.getAllRunTerminals();

        if (allTasks.length === 0) {
            outputChannel.info('No running terminals.');
            return;
        }

        const picks = allTasks.map((t) => ({
            label: `$(terminal) ${t.taskName}`,
            description: t.exePath,
            detail: `Created: ${t.createdAt.toLocaleTimeString()}`,
            terminal: t.terminal,
        }));

        const selected = await vscode.window.showQuickPick(picks, {
            placeHolder: 'Select a running terminal to show',
        });

        if (selected) {
            selected.terminal.show(true);
        }
    }

    /**
     * 关闭所有终端
     */
    public closeAllTerminals(): void {
        this.terminalManager.closeCompileTerminal();
        this.terminalManager.closeAllRunTerminals();
        outputChannel.info('All C++ Runner terminals closed.');
    }

    public dispose(): void {
        // 终端由 TerminalManager 管理
    }
}
