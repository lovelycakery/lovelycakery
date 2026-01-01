Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' 獲取 admin 目錄路徑（與 start.vbs 相同的邏輯）
scriptPath = fso.GetParentFolderName(WScript.ScriptFullName)
adminPath = scriptPath

' 自動查找 admin 目錄
If fso.GetBaseName(adminPath) = "admin" Then
    ' 腳本就在 admin 目錄內
Else
    ' 檢查腳本目錄下是否有 admin 子目錄
    If fso.FolderExists(scriptPath & "\admin") Then
        adminPath = scriptPath & "\admin"
    Else
        ' 向上查找 admin 目錄（最多向上 3 層）
        currentPath = scriptPath
        found = False
        For i = 1 To 3
            If fso.FolderExists(currentPath & "\admin") Then
                adminPath = currentPath & "\admin"
                found = True
                Exit For
            End If
            ' 向上移動一層
            parentPath = fso.GetParentFolderName(currentPath)
            If parentPath = currentPath Then
                ' 已經到達根目錄
                Exit For
            End If
            currentPath = parentPath
        Next
        ' 如果找不到，使用腳本所在目錄（假設腳本在 admin 內）
        If Not found Then
            adminPath = scriptPath
        End If
    End If
End If

' 建立桌面捷徑
desktopPath = WshShell.SpecialFolders("Desktop")
shortcutPath = desktopPath & "\Lovely Admin.lnk"
Set shortcut = WshShell.CreateShortcut(shortcutPath)
shortcut.TargetPath = adminPath & "\start.vbs"
shortcut.WorkingDirectory = adminPath

' 使用自訂圖示（如果存在），否則使用系統圖示
iconPath = adminPath & "\icon.ico"
If fso.FileExists(iconPath) Then
    shortcut.IconLocation = iconPath
Else
    ' 使用系統圖示作為備用
    shortcut.IconLocation = "C:\Windows\System32\shell32.dll,137"
End If

shortcut.Description = "Lovely Cakery Admin Tool"
shortcut.Save

MsgBox "桌面捷徑已建立！" & vbCrLf & vbCrLf & "圖示位置：" & iconPath, vbInformation, "Lovely Admin"

