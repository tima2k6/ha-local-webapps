param([ValidateSet('ClearHarmony','FinishCleanup','Logs','Exceptions')][string]$Mode = 'Logs')
$ErrorActionPreference = 'Stop'
$cfg = Get-Content -LiteralPath "$PSScriptRoot\..\js\ha-config.js" -Raw
$haUrl = [regex]::Match($cfg, 'HA_URL\s*=\s*[''"]([^''"]+)').Groups[1].Value
$haToken = [regex]::Match($cfg, 'HA_TOKEN\s*=\s*[''"]([^''"]+)').Groups[1].Value
$ws = New-Object System.Net.WebSockets.ClientWebSocket
$cts = New-Object System.Threading.CancellationTokenSource
$cts.CancelAfter(55000)
function Receive-Ha {
    $buffer = New-Object byte[] 65536
    $stream = New-Object System.IO.MemoryStream
    do {
        $result = $ws.ReceiveAsync([ArraySegment[byte]]::new($buffer), $cts.Token).GetAwaiter().GetResult()
        $stream.Write($buffer, 0, $result.Count)
    } while (!$result.EndOfMessage)
    [Text.Encoding]::UTF8.GetString($stream.ToArray()) | ConvertFrom-Json
}
$script:requestId = 0
function Invoke-HaWs($message) {
    $script:requestId++
    $message.id = $script:requestId
    $bytes = [Text.Encoding]::UTF8.GetBytes(($message | ConvertTo-Json -Depth 100 -Compress))
    $null = $ws.SendAsync([ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).GetAwaiter().GetResult()
    do { $response = Receive-Ha } while ($response.id -ne $script:requestId)
    if (!$response.success) { throw ($response.error | ConvertTo-Json -Compress) }
    $response.result
}
try {
    $null = $ws.ConnectAsync([uri](($haUrl -replace '^http','ws').TrimEnd('/') + '/api/websocket'), $cts.Token).GetAwaiter().GetResult()
    $null = Receive-Ha
    $bytes = [Text.Encoding]::UTF8.GetBytes((@{type='auth';access_token=$haToken} | ConvertTo-Json -Compress))
    $null = $ws.SendAsync([ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).GetAwaiter().GetResult()
    if ((Receive-Ha).type -ne 'auth_ok') { throw 'HA authentication failed' }
    if ($Mode -eq 'ClearHarmony') {
        $backup = Get-ChildItem -LiteralPath '\\192.168.2.125\config\backups_manual' -Directory -Filter 'log-cleanup-*' | Sort-Object Name | Select-Object -Last 1
        Copy-Item -LiteralPath '\\192.168.2.125\config\.storage\core.entity_registry' -Destination (Join-Path $backup.FullName 'core.entity_registry.json')
        $entities = Invoke-HaWs @{type='config/entity_registry/list'}
        $legacy = @($entities | Where-Object { $_.platform -eq 'hubitat' -and $_.entity_id -match 'harmony' })
        foreach ($entity in $legacy) {
            $null = Invoke-HaWs @{type='config/entity_registry/update';entity_id=$entity.entity_id;disabled_by='user'}
        }
        "Disabled legacy Hubitat Harmony entities: $($legacy.Count)"
        $orphan = $entities | Where-Object { $_.entity_id -eq 'update.harmony_card_update' -and $_.platform -eq 'hacs' }
        if ($orphan) {
            $null = Invoke-HaWs @{type='config/entity_registry/remove';entity_id=$orphan.entity_id}
            'Removed orphan Harmony card update entity.'
        }
        $headers = @{Authorization='Bearer '+$haToken}
        $result = Invoke-RestMethod -Method Delete -Uri ($haUrl + '/api/config/config_entries/entry/249c28540136323ba6e900a6ce78e06c') -Headers $headers -TimeoutSec 25
        'Removed Harmony integration: ' + ($result | ConvertTo-Json -Compress)
    } elseif ($Mode -eq 'FinishCleanup') {
        $entities = Invoke-HaWs @{type='config/entity_registry/list'}
        $oldPrinter = @($entities | Where-Object { $_.platform -eq 'hpprinter' -and $_.unique_id -like 'hpprinter_hpbd579d_*' })
        $mapped = 0
        foreach ($old in $oldPrinter) {
            $expected = $old.unique_id.Replace('hpprinter_hpbd579d_', 'hpprinter_192_168_2_170_')
            $new = @($entities | Where-Object { $_.platform -eq 'hpprinter' -and $_.unique_id -eq $expected })
            if ($new.Count -ne 1) { throw "Printer mapping is not unique: $($old.entity_id)" }
        }
        foreach ($old in $oldPrinter) {
            $expected = $old.unique_id.Replace('hpprinter_hpbd579d_', 'hpprinter_192_168_2_170_')
            $new = $entities | Where-Object { $_.platform -eq 'hpprinter' -and $_.unique_id -eq $expected }
            $null = Invoke-HaWs @{type='config/entity_registry/remove';entity_id=$old.entity_id}
            $update = @{type='config/entity_registry/update';entity_id=$new.entity_id;new_entity_id=$old.entity_id;disabled_by=$old.disabled_by}
            if ($null -ne $old.name) { $update.name = $old.name }
            $null = Invoke-HaWs $update
            $mapped++
        }
        "Preserved printer entity IDs: $mapped"
        foreach ($id in @('automation.capture_harmony_activity_on_camera_launch','input_text.last_harmony_activity')) {
            if ($entities | Where-Object { $_.entity_id -eq $id }) {
                $null = Invoke-HaWs @{type='config/entity_registry/remove';entity_id=$id}
            }
        }
        if ($entities | Where-Object { $_.entity_id -eq 'automation.stop_music_if_harmony_activity_turned_off' }) {
            $null = Invoke-HaWs @{type='config/entity_registry/update';entity_id='automation.stop_music_if_harmony_activity_turned_off';new_entity_id='automation.stop_music_if_activity_turned_off'}
        }
        'Removed stale Harmony helper records and renamed the remaining music automation.'
    } else {
        $logs = Invoke-HaWs @{type='system_log/list'}
        foreach ($entry in $logs) {
            if ($Mode -eq 'Exceptions') {
                if ($entry.name -in @('homeassistant.components.sensor','homeassistant.components.binary_sensor','homeassistant.components.portainer.coordinator')) {
                    $entry | ConvertTo-Json -Depth 15 -Compress
                }
                continue
            }
            $message = $entry.message -join ' '
            [pscustomobject]@{logger=$entry.name;count=$entry.count;timestamp=$entry.timestamp;message=$message.Substring(0,[Math]::Min(250,$message.Length))} | ConvertTo-Json -Compress
        }
    }
} finally { $ws.Dispose(); $cts.Dispose() }

