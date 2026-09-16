!macro customCheckAppRunning
  DetailPrint "Ensuring previous TradeIO instances are closed..."
  nsExec::Exec 'taskkill /F /IM TradeIO.exe /T'
  Pop $0
  Sleep 1000
!macroend

!macro customInit
  nsExec::Exec 'taskkill /F /IM TradeIO.exe /T'
  Pop $0
  Sleep 500
!macroend
