import * as vscode from 'vscode';

/**
 * 运行任务信息
 */
interface RunTaskInfo {
    terminal: vscode.Terminal;
    exePath: string;
    taskName: string;
    createdAt: Date;
    isRunning: boolean;
}

/**
 * 命令执行结果
 */
export interface CommandResult {
    exitCode: number;
    terminal: vscode.Terminal;
}

/**
 * 终端管理器
 * 
 * 管理编译终端和多个运行终端：
 * - 编译终端：共享的单例终端，所有编译任务在此终端执行
 * - 运行终端：每个运行任务一个终端，支持多个任务同时运行
 * 
 * 使用 Shell Integration API 获取命令退出码
 */
export class TerminalManager implements vscode.Disposable {
    private compileTerminalPreCreated = false;
    private compileTerminal: vscode.Terminal | undefined;
    private runTerminals: Map<string, RunTaskInfo[]> = new Map();
    private disposables: vscode.Disposable[] = [];

    // 终端名称
    private static readonly COMPILE_TERMINAL_NAME = 'C++ Compile';
    private static readonly RUN_TERMINAL_PREFIX = 'C++ Run:';

    constructor() {
        this.disposables.push(
            vscode.window.onDidCloseTerminal((closedTerminal) => {
                this.handleTerminalClose(closedTerminal);
            })
        );
    }

    /**
     * 预创建编译终端（在扩展激活时调用，确保编译终端在列表最前面）
     */
    public preCreateCompileTerminal(): void {
        if (this.compileTerminalPreCreated) { return; }
        this.compileTerminalPreCreated = true;

        // 创建编译终端（不显示）
        this.compileTerminal = vscode.window.createTerminal({
            name: TerminalManager.COMPILE_TERMINAL_NAME,
            iconPath: new vscode.ThemeIcon('gear'),
        });
        // 终端创建后会在列表最前面
    }

    /**
     * 获取或创建编译终端
     */
    private getOrCreateCompileTerminal(cwd?: string): vscode.Terminal {
        if (this.compileTerminal && vscode.window.terminals.includes(this.compileTerminal)) {
            return this.compileTerminal;
        }

        this.compileTerminal = vscode.window.createTerminal({
            name: TerminalManager.COMPILE_TERMINAL_NAME,
            cwd: cwd,
            iconPath: new vscode.ThemeIcon('gear'),
        });

        return this.compileTerminal;
    }

    /**
     * 在编译终端中执行命令（使用 Shell Integration 获取退出码）
     * @param command 要执行的命令
     * @param cwd 工作目录
     * @returns Promise<CommandResult> 包含退出码和终端
     */
    public async executeInCompileTerminal(
        command: string,
        cwd?: string
    ): Promise<CommandResult> {
        const terminal = this.getOrCreateCompileTerminal(cwd);
        terminal.show(true);

        // 直接执行命令，executeCommandWithExitCode 会自动处理 Shell Integration
        return await this.executeCommandWithExitCode(terminal, command);
    }

    /**
     * 在编译终端中执行命令（简单模式，不获取退出码）
     */
    public runInCompileTerminal(command: string, cwd?: string): vscode.Terminal {
        const terminal = this.getOrCreateCompileTerminal(cwd);
        terminal.show(true);
        terminal.sendText(command, true);

        return terminal;
    }

    /**
     * 使用 Shell Integration 执行命令并获取退出码
     */
    private async executeCommandWithExitCode(
        terminal: vscode.Terminal,
        command: string
    ): Promise<CommandResult> {
        // 检查 Shell Integration 是否可用
        if (terminal.shellIntegration) {
            return new Promise<CommandResult>((resolve) => {
                let resolved = false;

                // 监听命令执行结束事件
                const endListener = vscode.window.onDidEndTerminalShellExecution((e) => {
                    if (e.terminal === terminal && !resolved) {
                        resolved = true;
                        endListener.dispose();
                        resolve({
                            exitCode: e.exitCode ?? 1,
                            terminal: terminal,
                        });
                    }
                });

                // 执行命令
                try {
                    terminal.shellIntegration!.executeCommand(command);
                    terminal.show(true);
                } catch {
                    resolved = true;
                    endListener.dispose();
                    terminal.sendText(command, true);
                    resolve({ exitCode: 0, terminal });
                }

                // 超时保护：60秒超时
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        endListener.dispose();
                        resolve({ exitCode: 0, terminal });
                    }
                }, 60000);
            });
        } else {
            // 没有 Shell Integration，使用普通方式
            terminal.sendText(command, true);
            return { exitCode: 0, terminal };
        }
    }

    /**
     * 在新的运行终端中执行命令
     */
    public async executeInNewTerminal(
        exePath: string,
        command: string,
        cwd?: string
    ): Promise<RunTaskInfo> {
        const existing = this.runTerminals.get(exePath) || [];
        const instanceNum = existing.length + 1;

        const baseName = this.getExeDisplayName(exePath);
        const displayName = instanceNum > 1 ? `${baseName} #${instanceNum}` : baseName;
        const terminalName = `${TerminalManager.RUN_TERMINAL_PREFIX} ${displayName}`;

        const terminal = vscode.window.createTerminal({
            name: terminalName,
            cwd: cwd,
            iconPath: new vscode.ThemeIcon('play'),
        });

        const taskInfo: RunTaskInfo = {
            terminal,
            exePath,
            taskName: displayName,
            createdAt: new Date(),
            isRunning: true,
        };

        existing.push(taskInfo);
        this.runTerminals.set(exePath, existing);

        terminal.show(true);

        // 使用 Shell Integration 监听命令结束
        if (terminal.shellIntegration) {
            const endListener = vscode.window.onDidEndTerminalShellExecution((e) => {
                if (e.terminal === terminal) {
                    taskInfo.isRunning = false;
                    endListener.dispose();
                }
            });
            terminal.shellIntegration.executeCommand(command);
        } else {
            // 没有 Shell Integration，尝试使用事件监听
            const endListener = vscode.window.onDidEndTerminalShellExecution((e) => {
                if (e.terminal === terminal) {
                    taskInfo.isRunning = false;
                    endListener.dispose();
                }
            });
            terminal.sendText(command, true);
            // 如果没有 Shell Integration，假设命令很快就执行完（无法准确检测）
            // 用户可以手动关闭终端
        }

        return taskInfo;
    }

    /**
     * 在新的运行终端中执行命令（简单模式，保留兼容性）
     */
    public runInNewTerminal(exePath: string, command: string, cwd?: string): RunTaskInfo {
        const existing = this.runTerminals.get(exePath) || [];
        const instanceNum = existing.length + 1;

        const baseName = this.getExeDisplayName(exePath);
        const displayName = instanceNum > 1 ? `${baseName} #${instanceNum}` : baseName;
        const terminalName = `${TerminalManager.RUN_TERMINAL_PREFIX} ${displayName}`;

        const terminal = vscode.window.createTerminal({
            name: terminalName,
            cwd: cwd,
            iconPath: new vscode.ThemeIcon('play'),
        });

        terminal.show(true);
        terminal.sendText(command, true);

        const taskInfo: RunTaskInfo = {
            terminal,
            exePath,
            taskName: displayName,
            createdAt: new Date(),
            isRunning: false, // 简单模式不追踪状态
        };

        existing.push(taskInfo);
        this.runTerminals.set(exePath, existing);

        return taskInfo;
    }

    /**
     * 获取指定可执行文件的运行终端（所有）
     */
    public getRunTerminals(exePath: string): RunTaskInfo[] {
        const tasks = this.runTerminals.get(exePath) || [];
        return tasks.filter(t => vscode.window.terminals.includes(t.terminal));
    }

    /**
     * 获取指定可执行文件正在运行的终端
     */
    public getRunningTerminals(exePath: string): RunTaskInfo[] {
        const tasks = this.runTerminals.get(exePath) || [];
        return tasks.filter(t => vscode.window.terminals.includes(t.terminal) && t.isRunning);
    }

    /**
     * 获取指定可执行文件空闲的终端（程序已运行完毕）
     */
    public getIdleTerminals(exePath: string): RunTaskInfo[] {
        const tasks = this.runTerminals.get(exePath) || [];
        return tasks.filter(t => vscode.window.terminals.includes(t.terminal) && !t.isRunning);
    }

    /**
     * 在空闲终端中重新执行命令
     */
    public async executeInIdleTerminal(exePath: string, command: string): Promise<RunTaskInfo | null> {
        const idleTerminals = this.getIdleTerminals(exePath);
        if (idleTerminals.length === 0) {
            return null;
        }

        const taskInfo = idleTerminals[0];
        taskInfo.isRunning = true;
        taskInfo.terminal.show(true);

        // 使用 Shell Integration 监听命令结束
        if (taskInfo.terminal.shellIntegration) {
            const endListener = vscode.window.onDidEndTerminalShellExecution((e) => {
                if (e.terminal === taskInfo.terminal) {
                    taskInfo.isRunning = false;
                    endListener.dispose();
                }
            });
            taskInfo.terminal.shellIntegration.executeCommand(command);
        } else {
            const endListener = vscode.window.onDidEndTerminalShellExecution((e) => {
                if (e.terminal === taskInfo.terminal) {
                    taskInfo.isRunning = false;
                    endListener.dispose();
                }
            });
            taskInfo.terminal.sendText(command, true);
        }

        return taskInfo;
    }

    /**
     * 获取所有运行终端
     */
    public getAllRunTerminals(): RunTaskInfo[] {
        const all: RunTaskInfo[] = [];
        for (const tasks of this.runTerminals.values()) {
            all.push(...tasks.filter(t => vscode.window.terminals.includes(t.terminal)));
        }
        return all;
    }

    /**
     * 显示编译终端
     */
    public showCompileTerminal(): boolean {
        if (this.compileTerminal && vscode.window.terminals.includes(this.compileTerminal)) {
            this.compileTerminal.show(true);
            return true;
        }
        return false;
    }

    /**
     * 显示运行终端
     */
    public showRunTerminal(exePath: string): boolean {
        const tasks = this.getRunTerminals(exePath);
        if (tasks.length > 0) {
            tasks[0].terminal.show(true);
            return true;
        }
        return false;
    }

    /**
     * 关闭编译终端
     */
    public closeCompileTerminal(): void {
        if (this.compileTerminal && vscode.window.terminals.includes(this.compileTerminal)) {
            this.compileTerminal.dispose();
        }
        this.compileTerminal = undefined;
    }

    /**
     * 关闭指定可执行文件的运行终端
     */
    public closeRunTerminals(exePath: string): void {
        const tasks = this.runTerminals.get(exePath);
        if (tasks) {
            for (const task of tasks) {
                if (vscode.window.terminals.includes(task.terminal)) {
                    task.terminal.dispose();
                }
            }
            this.runTerminals.delete(exePath);
        }
    }

    /**
     * 关闭所有运行终端
     */
    public closeAllRunTerminals(): void {
        for (const tasks of this.runTerminals.values()) {
            for (const task of tasks) {
                if (vscode.window.terminals.includes(task.terminal)) {
                    task.terminal.dispose();
                }
            }
        }
        this.runTerminals.clear();
    }

    /**
     * 处理终端关闭事件
     */
    private handleTerminalClose(closedTerminal: vscode.Terminal): void {
        if (this.compileTerminal === closedTerminal) {
            this.compileTerminal = undefined;
            return;
        }

        for (const [exePath, tasks] of this.runTerminals.entries()) {
            const activeTasks = tasks.filter(t => t.terminal !== closedTerminal);
            if (activeTasks.length !== tasks.length) {
                if (activeTasks.length === 0) {
                    this.runTerminals.delete(exePath);
                } else {
                    this.runTerminals.set(exePath, activeTasks);
                }
                break;
            }
        }
    }

    /**
     * 获取可执行文件显示名称
     */
    private getExeDisplayName(exePath: string): string {
        const parts = exePath.replace(/\\/g, '/').split('/');
        return parts[parts.length - 1] || exePath;
    }

    /**
     * 获取运行终端数量
     */
    public getRunTerminalCount(): number {
        return this.getAllRunTerminals().length;
    }

    public dispose(): void {
        this.closeCompileTerminal();
        this.closeAllRunTerminals();
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables = [];
    }
}

// 全局单例
let terminalManagerInstance: TerminalManager | undefined;

export function getTerminalManager(): TerminalManager {
    if (!terminalManagerInstance) {
        terminalManagerInstance = new TerminalManager();
    }
    return terminalManagerInstance;
}

export function disposeTerminalManager(): void {
    if (terminalManagerInstance) {
        terminalManagerInstance.dispose();
        terminalManagerInstance = undefined;
    }
}
