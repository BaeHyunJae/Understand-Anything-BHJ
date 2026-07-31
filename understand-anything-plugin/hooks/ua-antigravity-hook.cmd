@echo off
REM understand-anything - Antigravity hook entry point.
REM
REM A batch wrapper rather than a direct PowerShell invocation: Antigravity's hook
REM runner mis-parses a command line carrying nested quotes, and %~dp0 lets this
REM script find its sibling without an absolute path baked into hooks.json.
REM
REM Keep CRLF line endings - cmd.exe misparses this file with LF-only endings.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ua-graph-staleness.ps1" -Format antigravity
if errorlevel 1 echo {}
exit /b 0
