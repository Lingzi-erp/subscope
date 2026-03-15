import { join } from 'path'
import { homedir } from 'os'

const BUN = join(homedir(), '.bun', 'bin', 'bun.exe')
const CLI = join(import.meta.dir, 'cli.ts')

// Windows toast notification — click opens subscope with latest items
export const notify = (title: string, body: string) => {
  // Toast with click action: launch subscope in a new terminal
  const launchCmd = `cmd /c start "subscope" "${BUN}" "${CLI}" -n 20`
    .replace(/\\/g, '\\\\').replace(/"/g, '&quot;')

  const ps = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null

$xmlStr = @"
<toast activationType="protocol" launch="${launchCmd}">
  <visual>
    <binding template="ToastGeneric">
      <text>${title}</text>
      <text>${body}</text>
    </binding>
  </visual>
</toast>
"@

$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($xmlStr)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("subscope").Show($toast)
`
  try {
    Bun.spawnSync(['powershell', '-NoProfile', '-Command', ps], { stdout: 'ignore', stderr: 'ignore' })
  } catch {}
}
