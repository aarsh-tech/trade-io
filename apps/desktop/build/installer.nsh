!macro customInit
  DetailPrint "Ensuring previous TradeIO instances are closed..."
  nsExec::Exec 'cmd /c taskkill /F /IM TradeIO.exe /T'
  Sleep 1000
!macroend
