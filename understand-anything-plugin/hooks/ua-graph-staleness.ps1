# understand-anything — knowledge-graph staleness check for platforms whose hooks
# expect a JSON document on stdout (Codex, Antigravity).
#
# Claude Code keeps its own bash implementation in claude-hooks.json; this script
# exists because the other two platforms cannot consume plain stdout text.
#
# Emits an empty object when there is nothing to say. Never fails the hook: any
# unexpected error also produces "{}", because a broken freshness check must not
# block the session.

[CmdletBinding()]
param(
    # Shapes the payload for the calling platform's hook output contract.
    [ValidateSet('codex', 'antigravity')]
    [string] $Format = 'antigravity',

    # Directory to inspect. Defaults to the process working directory, which both
    # platforms set to the session's project root.
    [string] $ProjectPath = '.'
)

$ErrorActionPreference = 'Stop'

function Write-Nothing {
    Write-Output '{}'
    exit 0
}

try {
    if (-not (Test-Path -LiteralPath $ProjectPath)) { Write-Nothing }

    $uaDir = Join-Path $ProjectPath '.understand-anything'
    if (-not (Test-Path -LiteralPath $uaDir)) {
        $uaDir = Join-Path $ProjectPath '.ua'
    }
    if (-not (Test-Path -LiteralPath $uaDir)) { Write-Nothing }

    $configPath = Join-Path $uaDir 'config.json'
    $metaPath = Join-Path $uaDir 'meta.json'
    $graphPath = Join-Path $uaDir 'knowledge-graph.json'
    foreach ($required in @($configPath, $metaPath, $graphPath)) {
        if (-not (Test-Path -LiteralPath $required)) { Write-Nothing }
    }

    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    if (-not $config.autoUpdate) { Write-Nothing }

    $head = & git -C $ProjectPath rev-parse HEAD 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $head) { Write-Nothing }

    $meta = Get-Content -LiteralPath $metaPath -Raw | ConvertFrom-Json
    if ($meta.gitCommitHash -eq $head.Trim()) { Write-Nothing }

    # $PSScriptRoot is <plugin root>/hooks, so the prompt sits beside this script.
    # Deriving it here keeps the message correct on the platform that exports no
    # plugin-root variable.
    $promptPath = Join-Path $PSScriptRoot 'auto-update-prompt.md'
    $message = "[understand-anything] Knowledge graph is stale. You MUST read the file at $promptPath and execute its instructions to check for structural changes and update the graph. Do not ask the user for confirmation - just do it."

    if ($Format -eq 'codex') {
        $payload = @{ additionalContext = $message }
    }
    else {
        $payload = @{ injectSteps = @( @{ ephemeralMessage = $message } ) }
    }

    Write-Output (ConvertTo-Json $payload -Depth 5 -Compress)
    exit 0
}
catch {
    Write-Output '{}'
    exit 0
}
