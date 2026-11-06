param([Parameter(Mandatory=$true)][string]$ApkPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$resolved=(Resolve-Path -LiteralPath $ApkPath).Path
$zip=[IO.Compression.ZipFile]::OpenRead($resolved)
try{
 $names=@($zip.Entries|ForEach-Object {$_.FullName})
 if(@($names|Where-Object {$_ -match '\\|(^|/)\.\.(/|$)|^/'}).Count){throw 'APK contains non-portable or unsafe ZIP entry paths (Android assets require forward slashes)'}
 $duplicates=@($names|Group-Object|Where-Object Count -gt 1)
 if($duplicates.Count){throw 'APK contains duplicate ZIP entry names'}
 foreach($name in @('AndroidManifest.xml','classes.dex','assets/www/index.html','assets/www/mobile-entry.mjs','assets/www/platform.mjs','assets/www/api-engine.mjs','assets/www/app.js','assets/www/style.css','assets/www/mobile.css','assets/www/core.mjs','assets/www/collector.mjs','assets/www/waimai.mjs','assets/www/location.mjs','assets/www/diagnostic-core.mjs','assets/www/calculator.mjs','assets/www/cities.json','assets/www/demo-input.json','assets/www/version.mjs')){
  $entry=$zip.GetEntry($name)
  if($null -eq $entry -or $entry.Length -eq 0){throw "Missing/empty APK entry: $name"}
 }
 # Validate the packaged HTML and module imports, not just source/build directories.
 foreach($entry in @($zip.Entries|Where-Object {$_.FullName -like 'assets/www/*' -and $_.FullName -match '\.(html|mjs|js)$'})){
  $reader=[IO.StreamReader]::new($entry.Open(),[Text.Encoding]::UTF8)
  try{$text=$reader.ReadToEnd()}finally{$reader.Dispose()}
  if($entry.FullName.EndsWith('.html')){$references=[regex]::Matches($text,'(?:src|href)="(/[a-zA-Z0-9._-]+)"')}
  else{$references=[regex]::Matches($text,'(?:from\s*|import\s*\()["''](\./[^"'']+|/[^"'']+)["'']')}
  foreach($reference in $references){$target=$reference.Groups[1].Value -replace '^\./','' -replace '^/','';if($null -eq $zip.GetEntry('assets/www/'+$target)){throw "Unresolved packaged reference: $($entry.FullName) -> $target"}}
 }
 $private=@($names|Where-Object {$_ -match '(^|/)(data|output|\.env|credentials|local-config)(/|\.|$)|\.(jks|keystore)$'})
 if($private.Count){throw 'Private/config/build material found in APK'}
 Write-Output "PASS: final APK paths, homepage, local module graph and private-file exclusions: $resolved"
}finally{$zip.Dispose()}
