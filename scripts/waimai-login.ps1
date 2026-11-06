[CmdletBinding()]
param([switch]$Start,[ValidateRange(1,65535)][int]$Port=8788)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$saved=@{}
foreach($key in @('WM_TOKEN','PORT','DATA_DIR','PUBLIC_ORIGIN','ACCESS_PASSWORD')){$saved[$key]=[Environment]::GetEnvironmentVariable($key,'Process')}
$secret=$null
$pointer=[IntPtr]::Zero
$resultCode=1
try {
    if($Start){
        $listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$Port)
        try{$listener.Start()}finally{$listener.Stop()}
    }
    $node=(Get-Command node.exe -ErrorAction Stop).Source
    $dir=Join-Path $root 'data/local-login-preview'
    [IO.Directory]::CreateDirectory($dir) | Out-Null
    foreach($name in @('settings.json','latest.json')){
        $source=Join-Path (Join-Path $root 'data') $name
        $destination=Join-Path $dir $name
        if((Test-Path -LiteralPath $source) -and -not(Test-Path -LiteralPath $destination)){[IO.File]::Copy($source,$destination,$false)}
    }
    Write-Host '仅验证本人歪麦登录态：配置握手 + 最多3页，不报名、不下单，不保存凭证。'
    Write-Host '不要粘贴密码、验证码或完整抓包，只输入本人请求头的token值。'
    $secret=Read-Host '粘贴token后按回车（不显示内容）' -AsSecureString
    $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $env:WM_TOKEN=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $pointer=[IntPtr]::Zero
    $env:PORT=[string]$Port
    $env:DATA_DIR=$dir
    $env:PUBLIC_ORIGIN=''
    $env:ACCESS_PASSWORD=''
    Push-Location -LiteralPath $root
    try {
        $arguments=@((Join-Path $PSScriptRoot 'waimai-session.mjs'))
        if($Start){$arguments+='--start'}
        & $node @arguments
        $resultCode=$LASTEXITCODE
    } finally {Pop-Location}
} catch {
    Write-Host '操作未完成：请检查Node、已保存的位置及端口占用。不输出凭证或原始错误。'
    $resultCode=1
} finally {
    if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
    if($null -ne $secret){$secret.Dispose()}
    foreach($key in $saved.Keys){if($null -eq $saved[$key]){Remove-Item -LiteralPath ('Env:'+$key) -ErrorAction SilentlyContinue}else{[Environment]::SetEnvironmentVariable($key,$saved[$key],'Process')}}
}
exit $resultCode
