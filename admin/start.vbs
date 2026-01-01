Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' 獲取腳本所在目錄
scriptPath = fso.GetParentFolderName(WScript.ScriptFullName)

' 自動查找 admin 目錄
' 方法 1：如果腳本在 admin 目錄內，直接使用
adminPath = scriptPath
If fso.GetBaseName(adminPath) = "admin" Then
    ' 腳本就在 admin 目錄內
Else
    ' 方法 2：檢查腳本目錄下是否有 admin 子目錄
    If fso.FolderExists(scriptPath & "\admin") Then
        adminPath = scriptPath & "\admin"
    Else
        ' 方法 3：向上查找 admin 目錄（最多向上 3 層）
        currentPath = scriptPath
        found = False
        For i = 1 To 3
            If fso.FolderExists(currentPath & "\admin") Then
                adminPath = currentPath & "\admin"
                found = True
                Exit For
            End If
            ' 向上移動一層
            currentPath = fso.GetParentFolderName(currentPath)
            If currentPath = fso.GetParentFolderName(currentPath) Then
                ' 已經到達根目錄
                Exit For
            End If
        Next
        ' 如果找不到，使用腳本所在目錄（假設腳本在 admin 內）
        If Not found Then
            adminPath = scriptPath
        End If
    End If
End If

WshShell.CurrentDirectory = adminPath

' 自動建立帶圖示的快捷方式（如果還沒有）
desktopPath = WshShell.SpecialFolders("Desktop")
shortcutPath = desktopPath & "\Lovely Admin.lnk"
If Not fso.FileExists(shortcutPath) Then
    Set shortcut = WshShell.CreateShortcut(shortcutPath)
    shortcut.TargetPath = adminPath & "\start.vbs"
    shortcut.WorkingDirectory = adminPath
    
    ' 使用自訂圖示（如果存在），否則使用系統圖示
    iconPath = adminPath & "\icon.ico"
    If fso.FileExists(iconPath) Then
        shortcut.IconLocation = iconPath
    Else
        shortcut.IconLocation = "C:\Windows\System32\shell32.dll,137"
    End If
    
    shortcut.Description = "Lovely Cakery Admin Tool"
    shortcut.Save
    Set shortcut = Nothing
End If

' 檢查 node_modules 是否存在
If Not fso.FolderExists(adminPath & "\node_modules") Then
    WshShell.Run "cmd /c cd /d """ & adminPath & """ && npm install", 1, True
End If

' 執行 npm start（隱藏命令視窗）
WshShell.Run "cmd /c cd /d """ & adminPath & """ && npm start", 0, False
Set WshShell = Nothing
Set fso = Nothing

