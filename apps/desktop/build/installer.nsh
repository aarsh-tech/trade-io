!macro customInit
  nsExec::Exec 'taskkill /F /IM TradeIO.exe /T'
  Pop $0
  Sleep 500
!macroend
