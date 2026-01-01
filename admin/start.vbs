Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptPath = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptPath

' 檢查 node_modules 是否存在
If Not fso.FolderExists(scriptPath & "\node_modules") Then
    WshShell.Run "cmd /c cd /d """ & scriptPath & """ && npm install", 1, True
End If

' 執行 npm start（隱藏命令視窗）
WshShell.Run "cmd /c cd /d """ & scriptPath & """ && npm start", 0, False
Set WshShell = Nothing
Set fso = Nothing

