// 插件 -> webview:
// 插件向webview发送消息: webview.postMessage()
// webview接收消息: window.addEventListener('message', (event) => {})

// webview -> 插件:
// webview向插件发送消息: const vscode = acquireVsCodeApi(); vscode.postMessage()
// 插件接收消息: webview.onDidReceiveMessage(message => {})

import * as vscode from 'vscode';
import { buildMode, clangDebugOptions, clangppPath, clangReleaseOptions, clangSanitizersOptions, clangWarningsOptions, compileCmd, compiler, CONFIG_SECTION, cppStandard, defines, excludedFileExtensions, gccDebugOptions, gccReleaseOptions, gccSanitizersOptions, gccWarningsOptions, globalBuildMode, globalCompiler, globalCppStandard, gppPath, linked_libraries, msvcDebugOptions, msvcPath, msvcReleaseOptions, msvcSanitizersOptions, msvcWarningsOptions, outputDirectory, programArgs, setBuildModeOptions, setExcludedFileExtensions, setGlobalBuildMode, setGlobalCompiler, setGlobalCppStandard, setOutputDirectory, setThemeColor, setToolchainPath, setToolchainSanitizers, setToolchainWarningsOptions, setTreatWarningsAsErrors, setWorkspaceBuildMode, setWorkspaceCompiler, setWorkspaceCppStandard, themeColor, treatWarningsAsErrors, updateDefines, updateLinkedLibraries, updateProgramArgs } from './config';

let statusBarItem: vscode.StatusBarItem | undefined;
let configWebviewPanel: vscode.WebviewPanel | undefined;

export function initializeStatusBarItem(): void
{
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    statusBarItem.text = '$(gear) C++ Runner Pro';
    statusBarItem.tooltip = 'Open C++ Runner Configuration';
    statusBarItem.command = 'cpp-runner.openConfig';
    statusBarItem.show();
}

function sendGlobalSettings(): void
{
    if (!configWebviewPanel) { return; }
    const settings = {
        global: { compiler: globalCompiler, buildMode: globalBuildMode, cppStandard: globalCppStandard },
        outputDirectory,
        treatWarningsAsErrors,
        excludedFileExtensions,
        themeColor,
        toolchains: {
            gcc: { path: gppPath, debug_options: gccDebugOptions, release_options: gccReleaseOptions, warnings_options: gccWarningsOptions, sanitizers_options: gccSanitizersOptions },
            clang: { path: clangppPath, debug_options: clangDebugOptions, release_options: clangReleaseOptions, warnings_options: clangWarningsOptions, sanitizers_options: clangSanitizersOptions },
            msvc: { path: msvcPath, debug_options: msvcDebugOptions, release_options: msvcReleaseOptions, warnings_options: msvcWarningsOptions, sanitizers_options: msvcSanitizersOptions }
        }
    };
    configWebviewPanel.webview.postMessage({
        command: 'globalSettings',
        settings
    });
}

function sendProjectSettings(): void
{
    if (!configWebviewPanel) { return; }

    configWebviewPanel.webview.postMessage({
        command: 'projectSettings',
        workspace: { compiler, buildMode, cppStandard },
        defines,
        linkedTokens: linked_libraries,
        args: programArgs
    });
}

function updateProjectSettingsUI(): void
{
    // Compile command is rebuilt automatically by onConfigChange when settings change
    configWebviewPanel?.webview.postMessage({
        command: 'previewUpdate',
        preview: compileCmd
    });
    vscode.window.showInformationMessage('Project settings updated.');
    sendProjectSettings();
}

function reloadWebview(): void
{
    if (configWebviewPanel)
    {
        configWebviewPanel.webview.html = getConfigWebviewHtml();
    }
}

export async function showConfigWebview(): Promise<void>
{
    if (configWebviewPanel)
    {
        configWebviewPanel.reveal();
        return;
    }

    configWebviewPanel = vscode.window.createWebviewPanel(
        'cppRunnerConfig',
        'C++ Runner Configuration',
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true }
    );

    configWebviewPanel.webview.html = getConfigWebviewHtml();

    // Send current compile command (already initialized at module load)
    configWebviewPanel.webview.postMessage({
        command: 'previewUpdate',
        preview: compileCmd
    });
    sendGlobalSettings();
    sendProjectSettings();

    configWebviewPanel.webview.onDidReceiveMessage(async message =>
    {
        switch (message.command)
        {
            case 'setCompiler':
                await setGlobalCompiler(message.value);
                break;
            case 'setBuildMode':
                await setGlobalBuildMode(message.value);
                break;
            case 'setCppStandard':
                await setGlobalCppStandard(message.value);
                break;
            case 'setOutputDirectory':
                await setOutputDirectory(message.value);
                break;
            case 'setTreatWarningsAsErrors':
                await setTreatWarningsAsErrors(Boolean(message.value));
                break;
            case 'setExcludedExtensions':
                await setExcludedFileExtensions(Array.isArray(message.value) ? message.value : []);
                break;
            case 'setToolchainPath':
                await setToolchainPath(message.compiler, message.value || '');
                break;
            case 'setToolchainModeOptions':
                await setBuildModeOptions(message.compiler, message.mode, message.value || '');
                break;
            case 'setToolchainWarnings':
                await setToolchainWarningsOptions(message.compiler, message.value || '');
                break;
            case 'setToolchainSanitizers':
                await setToolchainSanitizers(message.compiler, Array.isArray(message.value) ? message.value : []);
                break;

            case 'addDefine': {
                const arr = [...defines];
                const value = String(message.value || '').trim();
                if (value && !arr.includes(value))
                {
                    arr.push(value);
                    await updateDefines(arr);
                    updateProjectSettingsUI();
                }
                break;
            }
            case 'removeDefine': {
                const arr = defines.filter(d => d !== message.value);
                await updateDefines(arr);
                updateProjectSettingsUI();
                break;
            }
            case 'addLibraryToken': {
                const arr = [...linked_libraries];
                const value = String(message.value || '').trim();
                if (value)
                {
                    arr.push(value);
                    await updateLinkedLibraries(arr);
                    updateProjectSettingsUI();
                }
                break;
            }
            case 'removeLibraryToken': {
                const arr = linked_libraries.filter(t => t !== String(message.value));
                await updateLinkedLibraries(arr);
                updateProjectSettingsUI();
                break;
            }
            case 'addArg': {
                const arr = [...programArgs];
                const value = String(message.value || '').trim();
                if (value)
                {
                    arr.push(value);
                    await updateProgramArgs(arr);
                    updateProjectSettingsUI();
                }
                break;
            }
            case 'removeArg': {
                const arr = programArgs.filter(a => a !== message.value);
                await updateProgramArgs(arr);
                updateProjectSettingsUI();
                break;
            }
            case 'setProjectCompiler': {
                const value = String(message.value || '').trim();
                if (value)
                {
                    await setWorkspaceCompiler(value);
                    updateProjectSettingsUI();
                }
                break;
            }
            case 'setProjectBuildMode': {
                const value = String(message.value || '').trim();
                if (value)
                {
                    await setWorkspaceBuildMode(value);
                    updateProjectSettingsUI();
                }
                break;
            }
            case 'setProjectCppStandard': {
                const value = String(message.value || '').trim();
                if (value)
                {
                    await setWorkspaceCppStandard(value);
                    updateProjectSettingsUI();
                }
                break;
            }
            case 'setThemeColor': {
                const value = String(message.value || '').trim();
                if (value)
                {
                    await setThemeColor(value);
                    reloadWebview();
                }
                break;
            }

            default: break;
        }
    });

    const watcher = vscode.workspace.onDidChangeConfiguration(event =>
    {
        // 全局配置变更
        if (
            event.affectsConfiguration(`${CONFIG_SECTION}.compiler`) ||
            event.affectsConfiguration(`${CONFIG_SECTION}.buildMode`) ||
            event.affectsConfiguration(`${CONFIG_SECTION}.standard`) ||
            event.affectsConfiguration(`${CONFIG_SECTION}.linkedLibraries`)
        )
        {
            reloadWebview();
            setTimeout(() =>
            {
                sendGlobalSettings();
                sendProjectSettings();
            }, 120);
        }

        // 项目配置变更
        if ((vscode.workspace.workspaceFolders?.length || 0) >= 0 && (
            event.affectsConfiguration(`${CONFIG_SECTION}.defines`) ||
            event.affectsConfiguration(`${CONFIG_SECTION}.linked_libraries`) ||
            event.affectsConfiguration(`${CONFIG_SECTION}.programArgs`) ||
            event.affectsConfiguration(`${CONFIG_SECTION}.compiler`) ||
            event.affectsConfiguration(`${CONFIG_SECTION}.buildMode`) ||
            event.affectsConfiguration(`${CONFIG_SECTION}.standard`)
        ))
        {
            // Compile command is already rebuilt by onConfigChange in config.ts
            configWebviewPanel?.webview.postMessage({
                command: 'previewUpdate',
                preview: compileCmd
            });
            sendProjectSettings();
        }
    });

    configWebviewPanel.onDidDispose(() =>
    {
        watcher.dispose();
        configWebviewPanel = undefined;
    });
}

function getConfigWebviewHtml(): string
{

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>C++ Runner Configuration</title>
    <style>
        :root {
            /* Momotan-Start Theme Colors */
            --themeColor: #a74e66;
            --themeColorText: #ffffff;
            --themeColorShadow: rgba(167, 78, 102, 0.8);

            /* Light Theme */
            --bg-primary: #ffffff;
            --bg-secondary: rgba(255, 255, 255, 0.65);
            --bg-tertiary: rgba(255, 255, 255, 0.6);
            --bg-hover: rgba(0, 0, 0, 0.06);
            --bg-active: rgba(0, 0, 0, 0.1);

            /* 深黑色文字 - 更清晰 */
            --text-primary: #1a1a1a;
            --text-secondary: #444444;
            --text-tertiary: #666666;

            /* Shadows */
            --shadow-sm: 0 3px 20px rgba(0, 0, 0, 0.08);
            --shadow-md: 0 10px 32px rgba(0, 0, 0, 0.15);
            --shadow-lg: 0 20px 50px rgba(0, 0, 0, 0.2);

            /* Animations */
            --ease-smooth: cubic-bezier(0.175, 0.885, 0.32, 1);
            --ease-bounce: cubic-bezier(0.175, 0.885, 0.32, 1.275);
            --ease-out: cubic-bezier(0.4, 0, 0.2, 1);

            /* Spacing */
            --space-1: 4px;
            --space-2: 6px;
            --space-3: 10px;
            --space-4: 14px;
            --space-5: 16px;
            --space-6: 20px;
            --space-8: 26px;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            -webkit-tap-highlight-color: transparent;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }

        body {
            font-family: var(--vscode-font-family), 'Segoe UI', system-ui, -apple-system, sans-serif;
            font-size: 15px;
            font-weight: 450;
            line-height: 1.6;
            padding: var(--space-4);
            background: #ffffff;
            color: var(--text-primary);
            min-height: 100vh;
            transition: background-color 0.3s ease;
            text-rendering: optimizeLegibility;
        }

        /* Header */
        .app-header {
            position: relative;
            text-align: center;
            padding: var(--space-4) 0 var(--space-5);
            animation: fadeInDown 0.6s var(--ease-smooth);
        }

        .app-title {
            font-size: 32px;
            font-weight: 700;
            color: var(--themeColor);
            letter-spacing: -0.5px;
            transition: all 0.3s ease;
        }

        .app-title:hover {
            transform: scale(1.02);
        }

        /* Theme Color Button */
        .theme-btn {
            position: absolute;
            top: 0;
            right: 0;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: none;
            background: var(--themeColor);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 3px 10px var(--themeColorShadow);
            transition: all 0.3s ease;
            z-index: 10;
        }

        .theme-btn:hover {
            transform: scale(1.1);
            box-shadow: 0 4px 14px var(--themeColorShadow);
        }

        .theme-btn:active {
            transform: scale(0.95);
        }

        .theme-btn svg {
            width: 16px;
            height: 16px;
            color: #ffffff;
        }

        /* Color Picker Panel */
        .color-picker-panel {
            position: fixed;
            top: 16px;
            right: 16px;
            background: #ffffff;
            border-radius: 14px;
            padding: var(--space-3);
            box-shadow: var(--shadow-lg);
            z-index: 100;
            opacity: 0;
            visibility: hidden;
            transform: translateY(-10px) scale(0.95);
            transition: all 0.3s var(--ease-smooth);
        }

        .color-picker-panel.show {
            opacity: 1;
            visibility: visible;
            transform: translateY(0) scale(1);
        }

        .color-picker-title {
            font-size: 14px;
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: var(--space-3);
            text-align: center;
        }

        .color-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 6px;
        }

        .color-option {
            width: 32px;
            height: 32px;
            border-radius: 10px;
            border: none;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        }

        .color-option:hover {
            transform: scale(1.1);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .color-option:active {
            transform: scale(0.95);
        }

        .color-option.active::after {
            content: '';
            position: absolute;
            width: 16px;
            height: 16px;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'%3E%3C/polyline%3E%3C/svg%3E");
            background-size: contain;
            background-repeat: no-repeat;
        }

        .color-picker-close {
            position: absolute;
            top: 6px;
            right: 6px;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            border: none;
            background: rgba(0, 0, 0, 0.05);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
        }

        .color-picker-close:hover {
            background: rgba(0, 0, 0, 0.1);
            transform: scale(1.1);
        }

        .color-picker-close svg {
            width: 12px;
            height: 12px;
            color: var(--text-secondary);
        }

        /* Overlay */
        .overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: transparent;
            z-index: 99;
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s ease;
        }

        .overlay.show {
            opacity: 1;
            visibility: visible;
        }

        /* Cards */
        .card {
            background: #ffffff;
            border-radius: 18px;
            padding: var(--space-4);
            margin-bottom: var(--space-4);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
            border: 1px solid rgba(0, 0, 0, 0.06);
            transition: all 0.3s var(--ease-smooth);
            animation: fadeInUp 0.5s var(--ease-smooth) both;
            transform-origin: top;
        }

        .card:nth-child(2) { animation-delay: 0.1s; }
        .card:nth-child(3) { animation-delay: 0.15s; }
        .card:nth-child(4) { animation-delay: 0.2s; }
        .card:nth-child(5) { animation-delay: 0.25s; }
        .card:nth-child(6) { animation-delay: 0.3s; }
        .card:nth-child(7) { animation-delay: 0.35s; }

        .card:hover {
            box-shadow: var(--shadow-md);
            transform: translateY(-2px);
        }

        .card-title {
            font-size: 17px;
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: var(--space-3);
            padding-bottom: var(--space-2);
            border-bottom: 2px solid rgba(0, 0, 0, 0.08);
        }

        /* Panel Description */
        .panel-desc {
            font-size: 13px;
            color: var(--text-tertiary);
            margin-bottom: var(--space-3);
            line-height: 1.5;
            padding: var(--space-2) var(--space-3);
            background: rgba(0, 0, 0, 0.03);
            border-radius: 10px;
            border-left: 3px solid var(--themeColor);
        }

        /* Preview Card - Special */
        .preview-card {
            background: #fef7f8;
            border: 1px solid rgba(167, 78, 102, 0.12);
        }

        .preview-card .card-title {
            color: var(--themeColor);
        }

        .code-box {
            background: #f5f5f5;
            border-radius: 12px;
            padding: var(--space-3);
            font-family: 'SF Mono', Monaco, 'Fira Code', 'Consolas', monospace;
            font-size: 14px;
            font-weight: 500;
            overflow-x: auto;
            border: 1px solid rgba(0, 0, 0, 0.08);
        }

        #previewOutput {
            color: var(--themeColor);
            white-space: pre-wrap;
            word-break: break-all;
            line-height: 1.6;
            font-weight: 550;
        }

        /* Sections */
        .section {
            margin-bottom: var(--space-4);
        }

        .section:last-child {
            margin-bottom: 0;
        }

        .section-title {
            font-size: 16px;
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: var(--space-2);
            display: flex;
            align-items: center;
            gap: var(--space-2);
        }

        .section-hint {
            font-size: 14px;
            font-weight: 400;
            color: var(--text-tertiary);
            font-style: italic;
        }

        /* Input Fields */
        .text-field {
            width: 100%;
            padding: 10px 16px;
            border: 2px solid rgba(0, 0, 0, 0.12);
            border-radius: 50px;
            background: #ffffff;
            font-size: 14px;
            font-weight: 450;
            color: var(--text-primary);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
            outline: none;
            transition: all 0.3s ease;
        }

        .text-field:hover {
            border-color: rgba(0, 0, 0, 0.2);
        }

        .text-field:focus {
            border-color: var(--themeColor);
            box-shadow: 0 0 0 4px rgba(167, 78, 102, 0.15);
        }

        .text-field::placeholder {
            color: #888;
            font-weight: 400;
        }

        /* Toggle Switch */
        .toggle-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: var(--space-2) 0;
        }

        .toggle-label {
            color: var(--text-primary);
            font-size: 14px;
            font-weight: 500;
        }

        .switch {
            position: relative;
            display: inline-block;
            width: 40px;
            height: 24px;
        }

        .switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(150, 150, 150, 0.3);
            transition: all 0.3s ease;
            border-radius: 50px;
        }

        .slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: all 0.3s var(--ease-smooth);
            border-radius: 50%;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }

        input:checked + .slider {
            background-color: var(--themeColor);
        }

        input:checked + .slider:before {
            transform: translateX(16px);
        }

        input:focus-visible + .slider {
            box-shadow: 0 0 0 2px var(--themeColorShadow);
        }

        /* Chips */
        .chip-group {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
        }

        .chip {
            display: inline-flex;
            align-items: center;
            padding: 6px 12px;
            border-radius: 20px;
            border: 2px solid rgba(0, 0, 0, 0.12);
            background: transparent;
            color: var(--text-primary);
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s ease;
            user-select: none;
        }

        .chip:hover {
            background: var(--bg-hover);
            border-color: rgba(0, 0, 0, 0.2);
            color: var(--text-primary);
        }

        .chip:active {
            transform: scale(0.95);
        }

        .chip input {
            display: none;
        }

        .chip:has(input:checked) {
            background: color-mix(in srgb, var(--themeColor) 15%, transparent);
            border-color: var(--themeColor);
            color: var(--themeColor);
            font-weight: 600;
        }

        /* Buttons */
        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 8px 20px;
            border-radius: 50px;
            border: none;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            gap: var(--space-2);
        }

        .btn-filled {
            background: var(--themeColor);
            color: var(--themeColorText);
            box-shadow: 0 4px 15px var(--themeColorShadow);
        }

        .btn-filled:hover {
            transform: scale(1.05);
            box-shadow: 0 6px 20px var(--themeColorShadow);
        }

        .btn-filled:active {
            transform: scale(0.95);
        }

        .btn-tonal {
            background: color-mix(in srgb, var(--themeColor) 12%, transparent);
            color: var(--themeColor);
            font-weight: 600;
        }

        .btn-tonal:hover {
            background: color-mix(in srgb, var(--themeColor) 20%, transparent);
            transform: scale(1.03);
        }

        .btn-tonal:active {
            transform: scale(0.95);
        }

        /* Delete button */
        .delete-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: #fff;
            color: #d32f2f;
            border: 1.5px solid rgba(211, 47, 47, 0.35);
            padding: 4px 10px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            gap: 3px;
        }

        .delete-btn:hover {
            background: #ffebee;
            border-color: #d32f2f;
            transform: scale(1.05);
        }

        .delete-btn:active {
            transform: scale(0.95);
            background: #ffcdd2;
        }

        /* Tables */
        .data-table {
            width: 100%;
            border-collapse: collapse;
        }

        .data-table td {
            padding: var(--space-2);
            border-bottom: 1px solid rgba(0, 0, 0, 0.08);
        }

        .data-table tr:last-child td {
            border-bottom: none;
        }

        .data-table tr {
            transition: background-color 0.2s ease;
        }

        .data-table tr:hover {
            background: var(--bg-hover);
        }

        .data-table .mono {
            font-family: 'SF Mono', Monaco, 'Fira Code', 'Consolas', monospace;
            font-size: 13px;
            font-weight: 550;
            color: var(--themeColor);
        }

        /* Token List */
        .token-list {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
            list-style: none;
            min-height: 28px;
        }

        .token-item {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 5px 8px 5px 12px;
            background: #f5f5f5;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 450;
            transition: all 0.3s ease;
            border: 1px solid rgba(0, 0, 0, 0.08);
        }

        .token-item:hover {
            background: #eee;
            border-color: rgba(0, 0, 0, 0.12);
        }

        .token-item .mono {
            font-family: 'SF Mono', Monaco, 'Fira Code', 'Consolas', monospace;
            color: var(--themeColor);
            font-weight: 550;
        }

        .token-item .delete-btn {
            padding: 2px 6px;
            font-size: 11px;
            border-radius: 6px;
            background: transparent;
            border: 1px solid rgba(211, 47, 47, 0.25);
        }

        .token-item .delete-btn:hover {
            background: #ffebee;
            border-color: rgba(211, 47, 47, 0.5);
        }

        /* Input Row */
        .input-row {
            display: flex;
            gap: var(--space-2);
            align-items: center;
            margin-top: var(--space-3);
        }

        .input-row .text-field {
            flex: 1;
        }

        /* Helper text */
        .helper-text {
            font-size: 12px;
            font-weight: 400;
            color: var(--text-secondary);
            margin-top: 2px;
        }

        /* Placeholder */
        .placeholder-row td {
            color: var(--text-secondary);
            font-style: italic;
            text-align: center;
            padding: var(--space-3);
            font-size: 13px;
        }

        /* Divider */
        .divider {
            height: 1px;
            background: rgba(0, 0, 0, 0.06);
            margin: var(--space-4) 0;
        }

        /* Tab Navigation */
        .tab-nav {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-bottom: var(--space-4);
            padding: var(--space-2);
            background: rgba(0, 0, 0, 0.03);
            border-radius: 14px;
        }

        .tab-btn {
            padding: 8px 14px;
            border-radius: 10px;
            border: 1.5px solid rgba(0, 0, 0, 0.12);
            background: transparent;
            color: var(--text-secondary);
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.25s ease;
        }

        .tab-btn:hover {
            background: rgba(0, 0, 0, 0.06);
            border-color: rgba(0, 0, 0, 0.2);
            color: var(--text-primary);
        }

        .tab-btn.active {
            background: var(--themeColor);
            border-color: var(--themeColor);
            color: #ffffff;
            box-shadow: 0 2px 8px var(--themeColorShadow);
        }

        /* Settings Panels */
        .settings-panel {
            display: none;
        }

        .settings-panel.active {
            display: block;
        }

        /* Layout */
        .main-container {
            max-width: 800px;
            margin: 0 auto;
        }

        /* Animations */
        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(20px) perspective(800px) rotateX(-10deg) scale(0.98);
                filter: blur(5px);
            }
            to {
                opacity: 1;
                transform: translateY(0) perspective(800px) rotateX(0deg) scale(1);
                filter: blur(0);
            }
        }

        @keyframes fadeInDown {
            from {
                opacity: 0;
                transform: translateY(-20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        @media (max-width: 600px) {
            body { padding: var(--space-3); }
            .chip-group { gap: 4px; }
            .chip { padding: 5px 10px; }
            .card { padding: var(--space-3); border-radius: 14px; }
        }
    </style>
</head>
<body>
    <div class="overlay" id="overlay"></div>
    <div class="color-picker-panel" id="colorPickerPanel">
        <button class="color-picker-close" id="closeColorPicker">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
        <div class="color-picker-title">Theme Color</div>
        <div class="color-grid" id="colorGrid"></div>
    </div>

    <div class="main-container">
        <header class="app-header">
            <button class="theme-btn" id="themeBtn" title="Change theme color">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="5"></circle>
                    <line x1="12" y1="1" x2="12" y2="3"></line>
                    <line x1="12" y1="21" x2="12" y2="23"></line>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                    <line x1="1" y1="12" x2="3" y2="12"></line>
                    <line x1="21" y1="12" x2="23" y2="12"></line>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
            </button>
            <h1 class="app-title">C++ Runner Pro</h1>
        </header>

        <div class="card preview-card">
            <h2 class="card-title">Command Preview</h2>
            <div class="code-box">
                <code id="previewOutput">(loading preview...)</code>
            </div>
        </div>

        <nav class="tab-nav">
            <button class="tab-btn active" data-tab="project">Project Settings</button>
            <button class="tab-btn" data-tab="global">Global Settings</button>
            <button class="tab-btn" data-tab="gcc">GCC Settings</button>
            <button class="tab-btn" data-tab="clang">Clang Settings</button>
            <button class="tab-btn" data-tab="msvc">MSVC Settings</button>
        </nav>

        <div class="card settings-panel active" id="panel-project">
            <p class="panel-desc">Project Settings apply only to the current project and override Global Settings.</p>

            <div class="section">
                <span class="section-title">Compiler</span>
                <div class="chip-group">
                    <label class="chip"><input type="radio" name="projectCompiler" value="gcc" /> gcc</label>
                    <label class="chip"><input type="radio" name="projectCompiler" value="clang" /> clang</label>
                    <label class="chip"><input type="radio" name="projectCompiler" value="msvc" /> MSVC</label>
                </div>
            </div>

            <div class="section">
                <span class="section-title">Build Mode</span>
                <div class="chip-group">
                    <label class="chip"><input type="radio" name="projectBuildMode" value="release" /> Release</label>
                    <label class="chip"><input type="radio" name="projectBuildMode" value="debug" /> Debug</label>
                </div>
            </div>

            <div class="section">
                <span class="section-title">C++ Standard</span>
                <div class="chip-group">
                    <label class="chip"><input type="radio" name="projectCppStandard" value="c++11" /> C++11</label>
                    <label class="chip"><input type="radio" name="projectCppStandard" value="c++14" /> C++14</label>
                    <label class="chip"><input type="radio" name="projectCppStandard" value="c++17" /> C++17</label>
                    <label class="chip"><input type="radio" name="projectCppStandard" value="c++20" /> C++20</label>
                    <label class="chip"><input type="radio" name="projectCppStandard" value="c++23" /> C++23</label>
                    <label class="chip"><input type="radio" name="projectCppStandard" value="c++26" /> C++26</label>
                </div>
            </div>

            <div class="divider"></div>

            <div class="section" id="definesSection">
                <span class="section-title">Defines<span id="definesHint" class="section-hint"></span></span>
                <table class="data-table">
                    <tbody id="definesTbody"></tbody>
                </table>
                <div class="input-row">
                    <input id="defineInput" class="text-field" type="text" placeholder="Macro name (e.g. NDEBUG, DEBUG=1)" />
                    <button id="addDefine" class="btn btn-filled">Add</button>
                </div>
            </div>

            <div class="section" id="linkedSection">
                <span class="section-title">Linked Libraries<span id="linkedHint" class="section-hint"></span></span>
                <table class="data-table">
                    <tbody id="linkedTbody"></tbody>
                </table>
                <div class="input-row">
                    <input id="linkedTokenInput" class="text-field" type="text" placeholder="Library name (e.g. pthread, fmt)" />
                    <button id="addLinked" class="btn btn-filled">Add</button>
                </div>
            </div>

            <div class="section" id="argsSection">
                <span class="section-title">Program Args (argv)<span id="argsHint" class="section-hint"></span></span>
                <table class="data-table">
                    <tbody id="argsTbody"></tbody>
                </table>
                <div class="input-row">
                    <input id="argInput" class="text-field" type="text" placeholder="argument" />
                    <button id="addArg" class="btn btn-filled">Add</button>
                </div>
            </div>
        </div>

        <div class="card settings-panel" id="panel-global">
            <p class="panel-desc">Global Settings are default values. Project Settings inherit from these when not explicitly set.</p>

            <div class="section">
                <span class="section-title">Output Directory</span>
                <input id="outputDirInput" class="text-field" type="text" placeholder="./build" />

                <div class="toggle-row">
                    <span class="toggle-label">Treat warnings as errors</span>
                    <label class="switch">
                        <input type="checkbox" id="treatWarningsCheckbox" />
                        <span class="slider"></span>
                    </label>
                </div>

                <span class="section-title" style="margin-top: var(--md-space-4);">Excluded File Extensions</span>
                <input id="excludedExtensionsInput" class="text-field" type="text" placeholder=".txt, .md" />
                <div class="helper-text">Comma or space separated, e.g. .txt, .md</div>
            </div>

            <div class="divider"></div>

            <div class="section">
                <span class="section-title">Default Compiler</span>
                <div class="chip-group">
                    <label class="chip"><input type="radio" name="compiler" value="gcc" /> gcc</label>
                    <label class="chip"><input type="radio" name="compiler" value="clang" /> clang</label>
                    <label class="chip"><input type="radio" name="compiler" value="msvc" /> MSVC</label>
                </div>
            </div>

            <div class="section">
                <span class="section-title">Default Build Mode</span>
                <div class="chip-group">
                    <label class="chip"><input type="radio" name="buildMode" value="release" /> Release</label>
                    <label class="chip"><input type="radio" name="buildMode" value="debug" /> Debug</label>
                </div>
            </div>

            <div class="section">
                <span class="section-title">Default C++ Standard</span>
                <div class="chip-group">
                    <label class="chip"><input type="radio" name="cppStandard" value="c++11" /> C++11</label>
                    <label class="chip"><input type="radio" name="cppStandard" value="c++14" /> C++14</label>
                    <label class="chip"><input type="radio" name="cppStandard" value="c++17" /> C++17</label>
                    <label class="chip"><input type="radio" name="cppStandard" value="c++20" /> C++20</label>
                    <label class="chip"><input type="radio" name="cppStandard" value="c++23" /> C++23</label>
                    <label class="chip"><input type="radio" name="cppStandard" value="c++26" /> C++26</label>
                </div>
            </div>
        </div>

        <div class="card settings-panel" id="panel-gcc">

            <div class="section">
                <span class="section-title">Executable Path</span>
                <input id="gccPathInput" class="text-field" type="text" placeholder="g++" />
            </div>

            <div class="section">
                <span class="section-title">Debug Options</span>
                <ul id="gccDebugList" class="token-list"></ul>
                <div class="input-row">
                    <input id="gccDebugTokenInput" class="text-field" type="text" placeholder="-g" />
                    <button id="addGccDebugToken" class="btn btn-tonal">Add</button>
                </div>
            </div>

            <div class="section">
                <span class="section-title">Release Options</span>
                <ul id="gccReleaseList" class="token-list"></ul>
                <div class="input-row">
                    <input id="gccReleaseTokenInput" class="text-field" type="text" placeholder="-O2" />
                    <button id="addGccReleaseToken" class="btn btn-tonal">Add</button>
                </div>
            </div>

            <div class="section">
                <span class="section-title">Warnings Options</span>
                <ul id="gccWarningsList" class="token-list"></ul>
                <div class="input-row">
                    <input id="gccWarningsTokenInput" class="text-field" type="text" placeholder="-Wall" />
                    <button id="addGccWarningsToken" class="btn btn-tonal">Add</button>
                </div>
            </div>

            <div class="section">
                <span class="section-title">Sanitizers</span>
                <ul id="gccSanitizersList" class="token-list"></ul>
                <div class="input-row">
                    <input id="gccSanitizersTokenInput" class="text-field" type="text" placeholder="address" />
                    <button id="addGccSanitizersToken" class="btn btn-tonal">Add</button>
                </div>
            </div>
        </div>

        <div class="card settings-panel" id="panel-clang">

            <div class="section">
                <span class="section-title">Executable Path</span>
                <input id="clangPathInput" class="text-field" type="text" placeholder="clang++" />
            </div>

            <div class="section">
                <span class="section-title">Debug Options</span>
                <ul id="clangDebugList" class="token-list"></ul>
                <div class="input-row">
                    <input id="clangDebugTokenInput" class="text-field" type="text" placeholder="-g" />
                    <button id="addClangDebugToken" class="btn btn-tonal">Add</button>
                </div>
            </div>

            <div class="section">
                <span class="section-title">Release Options</span>
                <ul id="clangReleaseList" class="token-list"></ul>
                <div class="input-row">
                    <input id="clangReleaseTokenInput" class="text-field" type="text" placeholder="-O2" />
                    <button id="addClangReleaseToken" class="btn btn-tonal">Add</button>
                </div>
            </div>

            <div class="section">
                <span class="section-title">Warnings Options</span>
                <ul id="clangWarningsList" class="token-list"></ul>
                <div class="input-row">
                    <input id="clangWarningsTokenInput" class="text-field" type="text" placeholder="-Wall" />
                    <button id="addClangWarningsToken" class="btn btn-tonal">Add</button>
                </div>
            </div>

            <div class="section">
                <span class="section-title">Sanitizers</span>
                <ul id="clangSanitizersList" class="token-list"></ul>
                <div class="input-row">
                    <input id="clangSanitizersTokenInput" class="text-field" type="text" placeholder="address" />
                    <button id="addClangSanitizersToken" class="btn btn-tonal">Add</button>
                </div>
            </div>
        </div>

        <div class="card settings-panel" id="panel-msvc">

            <div class="section">
                <span class="section-title">Executable Path</span>
                <input id="msvcPathInput" class="text-field" type="text" placeholder="cl.exe" />
            </div>

            <div class="section">
                <span class="section-title">Debug Options</span>
                <ul id="msvcDebugList" class="token-list"></ul>
                <div class="input-row">
                    <input id="msvcDebugTokenInput" class="text-field" type="text" placeholder="/Zi" />
                    <button id="addMsvcDebugToken" class="btn btn-tonal">Add</button>
                </div>
            </div>

            <div class="section">
                <span class="section-title">Release Options</span>
                <ul id="msvcReleaseList" class="token-list"></ul>
                <div class="input-row">
                    <input id="msvcReleaseTokenInput" class="text-field" type="text" placeholder="/O2" />
                    <button id="addMsvcReleaseToken" class="btn btn-tonal">Add</button>
                </div>
            </div>

            <div class="section">
                <span class="section-title">Warnings Options</span>
                <ul id="msvcWarningsList" class="token-list"></ul>
                <div class="input-row">
                    <input id="msvcWarningsTokenInput" class="text-field" type="text" placeholder="/W4" />
                    <button id="addMsvcWarningsToken" class="btn btn-tonal">Add</button>
                </div>
            </div>

            <div class="section">
                <span class="section-title">Sanitizers</span>
                <ul id="msvcSanitizersList" class="token-list"></ul>
                <div class="input-row">
                    <input id="msvcSanitizersTokenInput" class="text-field" type="text" placeholder="address" />
                    <button id="addMsvcSanitizersToken" class="btn btn-tonal">Add</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        (function() {
            const vscode = acquireVsCodeApi();

            // Theme color definitions (matching package.json enum)
            const themeColors = {
                magenta: { color: '#a74e66', shadow: 'rgba(167, 78, 102, 0.8)' },
                rose: { color: '#b64859', shadow: 'rgba(182, 72, 89, 0.8)' },
                pink: { color: '#cd6782', shadow: 'rgba(205, 103, 130, 0.8)' },
                orange: { color: '#dc995c', shadow: 'rgba(220, 153, 92, 0.8)' },
                yellow: { color: '#D4B24D', shadow: 'rgba(212, 178, 77, 0.8)' },
                green: { color: '#4CAF50', shadow: 'rgba(76, 175, 80, 0.8)' },
                teal: { color: '#009688', shadow: 'rgba(0, 150, 136, 0.8)' },
                blue: { color: '#2196F3', shadow: 'rgba(33, 150, 243, 0.8)' },
                purple: { color: '#9C27B0', shadow: 'rgba(156, 39, 176, 0.8)' },
                brown: { color: '#795548', shadow: 'rgba(121, 85, 72, 0.8)' },
                grey: { color: '#607D8B', shadow: 'rgba(96, 125, 139, 0.8)' },
                black: { color: '#333333', shadow: 'rgba(51, 51, 51, 0.8)' }
            };

            let currentThemeColor = 'magenta';

            function $(id) {
                return document.getElementById(id);
            }

            // Initialize color picker
            function initColorPicker() {
                const colorGrid = $('colorGrid');
                if (!colorGrid) { return; }

                colorGrid.innerHTML = '';
                Object.keys(themeColors).forEach(name => {
                    const btn = document.createElement('button');
                    btn.className = 'color-option' + (name === currentThemeColor ? ' active' : '');
                    btn.style.background = themeColors[name].color;
                    btn.setAttribute('data-theme', name);
                    btn.setAttribute('title', name.charAt(0).toUpperCase() + name.slice(1));
                    btn.addEventListener('click', () => selectThemeColor(name));
                    colorGrid.appendChild(btn);
                });
            }

            // Apply theme color
            function applyThemeColor(themeName) {
                const theme = themeColors[themeName];
                if (!theme) { return; }

                currentThemeColor = themeName;
                const root = document.documentElement;
                root.style.setProperty('--themeColor', theme.color);
                root.style.setProperty('--themeColorShadow', theme.shadow);

                // Update active state in color grid
                document.querySelectorAll('.color-option').forEach(btn => {
                    btn.classList.toggle('active', btn.getAttribute('data-theme') === themeName);
                });
            }

            // Select theme color
            function selectThemeColor(themeName) {
                applyThemeColor(themeName);
                vscode.postMessage({ command: 'setThemeColor', value: themeName });
            }

            // Color picker panel toggle
            const themeBtn = $('themeBtn');
            const colorPickerPanel = $('colorPickerPanel');
            const overlay = $('overlay');
            const closeColorPicker = $('closeColorPicker');

            if (themeBtn && colorPickerPanel && overlay) {
                themeBtn.addEventListener('click', () => {
                    initColorPicker();
                    colorPickerPanel.classList.add('show');
                    overlay.classList.add('show');
                });

                closeColorPicker?.addEventListener('click', () => {
                    colorPickerPanel.classList.remove('show');
                    overlay.classList.remove('show');
                });

                overlay.addEventListener('click', () => {
                    colorPickerPanel.classList.remove('show');
                    overlay.classList.remove('show');
                });
            }

            // Tab navigation
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const tabId = btn.getAttribute('data-tab');
                    if (!tabId) { return; }

                    // Update tab buttons
                    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    // Update panels
                    document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
                    const panel = $('panel-' + tabId);
                    if (panel) { panel.classList.add('active'); }
                });
            });

            function tokenize(value) {
                return (value || '').split(/[\s,]+/).map(token => token.trim()).filter(Boolean);
            }

            // 轻封装：单选组赋值与事件绑定（保持原生）
            function setGroupValue(name, value) {
                if (!value) { return; }
                const radio = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
                if (radio) { radio.checked = true; }
            }

            function bindRadioGroup(name, onChange) {
                document.querySelectorAll('input[name="' + name + '"]').forEach(radio => {
                    radio.addEventListener('change', (e) => {
                        if (e.target && e.target.checked) {
                            onChange(e.target.value);
                        }
                    });
                });
            }

            // 轻封装：原生 TokenList 组件
            class TokenList {
                constructor(desc) {
                    this.listId = desc.listId;
                    this.inputId = desc.inputId;
                    this.addBtnId = desc.addBtnId;
                    this.compiler = desc.compiler;
                    this.kind = desc.kind; // 'mode' | 'warnings' | 'sanitizers'
                    this.mode = desc.mode; // 'debug' | 'release' | undefined
                    this.listEl = $(this.listId);
                    this.inputEl = $(this.inputId);
                    this.addBtn = $(this.addBtnId);
                    this._bind();
                }
                _render(tokens) {
                    if (!this.listEl) { return; }
                    if (!tokens || !tokens.length) {
                        this.listEl.innerHTML = '';
                        return;
                    }
                    this.listEl.innerHTML = tokens.map(t => '<li class="token-item"><span class="mono">' + escapeHtml(t) + '</span> <button class="delete-btn" data-token="' + escapeAttr(t) + '"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></li>').join('');
                }
                _collect() {
                    return Array.from(this.listEl.querySelectorAll('li .mono')).map(el => el.textContent || '').filter(Boolean);
                }
                _post(tokens) {
                    if (this.kind === 'mode') {
                        vscode.postMessage({ command: 'setToolchainModeOptions', compiler: this.compiler, mode: this.mode, value: tokens });
                    } else if (this.kind === 'warnings') {
                        vscode.postMessage({ command: 'setToolchainWarnings', compiler: this.compiler, value: tokens });
                    } else {
                        vscode.postMessage({ command: 'setToolchainSanitizers', compiler: this.compiler, value: tokens });
                    }
                }
                set(tokens) {
                    this._render(tokens || []);
                }
                _bind() {
                    if (this.addBtn && this.inputEl && this.listEl) {
                        this.addBtn.addEventListener('click', () => {
                            const v = String(this.inputEl.value || '').trim();
                            if (!v) { return; }
                            let tokens = this._collect();
                            if (tokens.includes(v)) { this.inputEl.value = ''; return; }
                            tokens.push(v);
                            this._render(tokens);
                            this._post(tokens);
                            this.inputEl.value = '';
                        });
                    }
                    if (this.listEl) {
                        this.listEl.addEventListener('click', (e) => {
                            const t = e.target;
                            if (t && t.dataset && t.dataset.token) {
                                const tok = String(t.dataset.token);
                                let tokens = this._collect().filter(x => x !== tok);
                                this._render(tokens);
                                this._post(tokens);
                            }
                        });
                    }
                }
            }

            // 旧的 setRadioGroupValue 已被 setGroupValue 取代

            function setInputValue(id, value) {
                const el = $(id);
                if (el) {
                    el.value = value || '';
                }
            }

            function setCheckboxValue(id, checked) {
                const el = $(id);
                if (el) {
                    el.checked = Boolean(checked);
                }
            }

            function setToolchainInputs(compiler, data) {
                if (!data) { return; }
                setInputValue(compiler + 'PathInput', data.path);
                const dbg = Array.isArray(data.debug_options) ? data.debug_options : [];
                const rel = Array.isArray(data.release_options) ? data.release_options : [];
                const warn = Array.isArray(data.warnings_options) ? data.warnings_options : [];
                const sani = Array.isArray(data.sanitizers_options) ? data.sanitizers_options : [];
                listsById[compiler + 'DebugList']?.set(dbg);
                listsById[compiler + 'ReleaseList']?.set(rel);
                listsById[compiler + 'WarningsList']?.set(warn);
                listsById[compiler + 'SanitizersList']?.set(sani);
            }


            function updateSettings(payload) {
                if (!payload) { return; }
                const { global, outputDirectory, treatWarningsAsErrors, excludedFileExtensions, themeColor: savedThemeColor, toolchains } = payload;

                setInputValue('outputDirInput', outputDirectory);
                setCheckboxValue('treatWarningsCheckbox', treatWarningsAsErrors);
                setInputValue('excludedExtensionsInput', (excludedFileExtensions || []).join(', '));

                // Apply saved theme color
                if (savedThemeColor && themeColors[savedThemeColor]) {
                    applyThemeColor(savedThemeColor);
                }

                // Global radio groups
                setGroupValue('compiler', global.compiler);
                setGroupValue('buildMode', global.buildMode);
                setGroupValue('cppStandard', global.cppStandard);

                if (toolchains) {
                    setToolchainInputs('gcc', toolchains.gcc);
                    setToolchainInputs('clang', toolchains.clang);
                    setToolchainInputs('msvc', toolchains.msvc);
                }
            }

            // 全局设置事件处理 - 修改任何设置都会触发预览更新
            bindRadioGroup('compiler', (val) => {
                vscode.postMessage({ command: 'setCompiler', value: val });
            });

            const outputDirInput = $('outputDirInput');
            if (outputDirInput) {
                outputDirInput.addEventListener('change', () => {
                    vscode.postMessage({ command: 'setOutputDirectory', value: outputDirInput.value.trim() });
                });
            }

            const treatWarningsCheckbox = $('treatWarningsCheckbox');
            if (treatWarningsCheckbox) {
                treatWarningsCheckbox.addEventListener('change', () => {
                    vscode.postMessage({ command: 'setTreatWarningsAsErrors', value: treatWarningsCheckbox.checked });
                });
            }

            const excludedExtensionsInput = $('excludedExtensionsInput');
            if (excludedExtensionsInput) {
                excludedExtensionsInput.addEventListener('change', () => {
                    vscode.postMessage({ command: 'setExcludedExtensions', value: tokenize(excludedExtensionsInput.value) });
                });
            }

            function setupToolchainListeners(compiler) {
                const pathInput = $(compiler + 'PathInput');
                if (pathInput) {
                    pathInput.addEventListener('change', () => {
                        vscode.postMessage({ command: 'setToolchainPath', compiler, value: pathInput.value.trim() });
                    });
                }
            }

            const TL_DESCS = [
                { listId: 'gccDebugList', inputId: 'gccDebugTokenInput', addBtnId: 'addGccDebugToken', compiler: 'gcc', kind: 'mode', mode: 'debug' },
                { listId: 'gccReleaseList', inputId: 'gccReleaseTokenInput', addBtnId: 'addGccReleaseToken', compiler: 'gcc', kind: 'mode', mode: 'release' },
                { listId: 'gccWarningsList', inputId: 'gccWarningsTokenInput', addBtnId: 'addGccWarningsToken', compiler: 'gcc', kind: 'warnings' },
                { listId: 'gccSanitizersList', inputId: 'gccSanitizersTokenInput', addBtnId: 'addGccSanitizersToken', compiler: 'gcc', kind: 'sanitizers' },
                { listId: 'clangDebugList', inputId: 'clangDebugTokenInput', addBtnId: 'addClangDebugToken', compiler: 'clang', kind: 'mode', mode: 'debug' },
                { listId: 'clangReleaseList', inputId: 'clangReleaseTokenInput', addBtnId: 'addClangReleaseToken', compiler: 'clang', kind: 'mode', mode: 'release' },
                { listId: 'clangWarningsList', inputId: 'clangWarningsTokenInput', addBtnId: 'addClangWarningsToken', compiler: 'clang', kind: 'warnings' },
                { listId: 'clangSanitizersList', inputId: 'clangSanitizersTokenInput', addBtnId: 'addClangSanitizersToken', compiler: 'clang', kind: 'sanitizers' },
                { listId: 'msvcDebugList', inputId: 'msvcDebugTokenInput', addBtnId: 'addMsvcDebugToken', compiler: 'msvc', kind: 'mode', mode: 'debug' },
                { listId: 'msvcReleaseList', inputId: 'msvcReleaseTokenInput', addBtnId: 'addMsvcReleaseToken', compiler: 'msvc', kind: 'mode', mode: 'release' },
                { listId: 'msvcWarningsList', inputId: 'msvcWarningsTokenInput', addBtnId: 'addMsvcWarningsToken', compiler: 'msvc', kind: 'warnings' },
                { listId: 'msvcSanitizersList', inputId: 'msvcSanitizersTokenInput', addBtnId: 'addMsvcSanitizersToken', compiler: 'msvc', kind: 'sanitizers' }
            ];
            const listsById = Object.fromEntries(TL_DESCS.map(d => [d.listId, new TokenList(d)]));

            setupToolchainListeners('gcc');
            setupToolchainListeners('clang');
            setupToolchainListeners('msvc');
            // 列表交互由 TokenList 封装完成

            bindRadioGroup('buildMode', (val) => {
                vscode.postMessage({ command: 'setBuildMode', value: val });
            });

            bindRadioGroup('cppStandard', (val) => {
                vscode.postMessage({ command: 'setCppStandard', value: val });
            });

            // 项目设置事件处理
            function send(command, value) {
                vscode.postMessage({ command, value });
            }

            bindRadioGroup('projectCompiler', (val) => {
                send('setProjectCompiler', val);
            });

            bindRadioGroup('projectBuildMode', (val) => {
                send('setProjectBuildMode', val);
            });

            bindRadioGroup('projectCppStandard', (val) => {
                send('setProjectCppStandard', val);
            });

            function escapeHtml(s) {
                return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }

            function escapeAttr(s) {
                return s.replace(/"/g, '&quot;');
            }

            function escapeCss(s) {
                return s.replace(/"/g, '&quot;');
            }

            function hasDuplicate(tbody, attr, value) {
                return !!tbody.querySelector('button[data-' + attr + '="' + escapeCss(value) + '"]');
            }

            function flashExisting(tbody, attr, value) {
                const btn = tbody.querySelector('button[data-' + attr + '="' + escapeCss(value) + '"]');
                if (btn) {
                    btn.classList.add('dup-warn');
                    setTimeout(() => btn.classList.remove('dup-warn'), 900);
                }
            }

            function ensurePlaceholder() {
                const definesTbody = document.getElementById('definesTbody');
                const linkedTbody = document.getElementById('linkedTbody');
                const argsTbody = document.getElementById('argsTbody');
                const definesHint = document.getElementById('definesHint');
                const linkedHint = document.getElementById('linkedHint');
                const argsHint = document.getElementById('argsHint');

                if (definesTbody && definesHint) {
                    if (!definesTbody.children.length) {
                        definesHint.textContent = '(No defines configured)';
                    } else {
                        definesHint.textContent = '';
                    }
                }
                if (linkedTbody && linkedHint) {
                    if (!linkedTbody.children.length) {
                        linkedHint.textContent = '(No libraries linked)';
                    } else {
                        linkedHint.textContent = '';
                    }
                }
                if (argsTbody && argsHint) {
                    if (!argsTbody.children.length) {
                        argsHint.textContent = '(No program arguments)';
                    } else {
                        argsHint.textContent = '';
                    }
                }
            }

            function row(type, val) {
                return '<tr><td class="mono">' + escapeHtml(val) + '</td><td><button data-' + type + '="' + escapeAttr(val) + '" class="delete-btn"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>Remove</button></td></tr>';
            }

            // 添加按钮事件
            if (document.getElementById('addDefine')) {
                document.getElementById('addDefine').onclick = () => {
                    const el = document.getElementById('defineInput');
                    const v = el.value.trim();
                    if (v) {
                        const definesTbody = document.getElementById('definesTbody');
                        if (hasDuplicate(definesTbody, 'define', v)) {
                            flashExisting(definesTbody, 'define', v);
                            el.value = '';
                            return;
                        }
                        if (definesTbody.querySelector('.placeholder')) definesTbody.innerHTML = '';
                        send('addDefine', v);
                        definesTbody.innerHTML += row('define', v);
                        el.value = '';
                    }
                    ensurePlaceholder();
                };
            }

            if (document.getElementById('addLinked')) {
                document.getElementById('addLinked').onclick = () => {
                    const el = document.getElementById('linkedTokenInput');
                    const v = el.value.trim();
                    if (v) {
                        const linkedTbody = document.getElementById('linkedTbody');
                        if (hasDuplicate(linkedTbody, 'lib', v)) {
                            flashExisting(linkedTbody, 'lib', v);
                            el.value = '';
                            return;
                        }
                        if (linkedTbody.querySelector('.placeholder')) linkedTbody.innerHTML = '';
                        send('addLibraryToken', v);
                        linkedTbody.innerHTML += row('lib', v);
                        el.value = '';
                    }
                    ensurePlaceholder();
                };
            }

            if (document.getElementById('addArg')) {
                document.getElementById('addArg').onclick = () => {
                    const el = document.getElementById('argInput');
                    const v = el.value.trim();
                    if (v) {
                        const argsTbody = document.getElementById('argsTbody');
                        if (hasDuplicate(argsTbody, 'arg', v)) {
                            flashExisting(argsTbody, 'arg', v);
                            el.value = '';
                            return;
                        }
                        if (argsTbody.querySelector('.placeholder')) argsTbody.innerHTML = '';
                        send('addArg', v);
                        argsTbody.innerHTML += row('arg', v);
                        el.value = '';
                    }
                    ensurePlaceholder();
                };
            }

            // 删除按钮事件委托
            if (document.getElementById('definesTbody')) {
                document.getElementById('definesTbody').addEventListener('click', e => {
                    const t = e.target;
                    if (t && t.dataset && t.dataset.define) {
                        send('removeDefine', t.dataset.define);
                    }
                });
            }

            if (document.getElementById('linkedTbody')) {
                document.getElementById('linkedTbody').addEventListener('click', e => {
                    const t = e.target;
                    if (t && t.dataset && t.dataset.lib) {
                        send('removeLibraryToken', t.dataset.lib);
                    }
                });
            }

            if (document.getElementById('argsTbody')) {
                document.getElementById('argsTbody').addEventListener('click', e => {
                    const t = e.target;
                    if (t && t.dataset && t.dataset.arg) {
                        send('removeArg', t.dataset.arg);
                    }
                });
            }

            // 消息监听 - 实时更新预览
            window.addEventListener('message', ev => {
                const msg = ev.data;

                if (msg.command === 'globalSettings') {
                    updateSettings(msg.settings);
                }

                if (msg.command === 'previewUpdate') {
                    const previewEl = document.getElementById('previewOutput');
                    if (previewEl) {
                        previewEl.textContent = msg.preview;
                    }
                }

                if (msg.command === 'projectSettings') {
                    const definesTbody = document.getElementById('definesTbody');
                    const linkedTbody = document.getElementById('linkedTbody');
                    const argsTbody = document.getElementById('argsTbody');

                    if (definesTbody) {
                        definesTbody.innerHTML = msg.defines.map(function (d) {
                            return row('define', d);
                        }).join('');
                    }
                    if (linkedTbody) {
                        linkedTbody.innerHTML = msg.linkedTokens.map(function (t) {
                            return row('lib', t);
                        }).join('');
                    }
                    if (argsTbody) {
                        argsTbody.innerHTML = msg.args.map(function (a) {
                            return row('arg', a);
                        }).join('');
                    }

                    // 设置项目级配置，fallback到全局配置已在updateSettings中处理
                    if (msg.workspace) {
                        setGroupValue('projectCompiler', msg.workspace.compiler);
                        setGroupValue('projectBuildMode', msg.workspace.buildMode);
                        setGroupValue('projectCppStandard', msg.workspace.cppStandard);
                    }

                    ensurePlaceholder();
                }
            });

            ensurePlaceholder();
        })();
    </script>
</body>
</html>`;
}
