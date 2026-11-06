param(
 [Parameter(Mandatory=$true)][string]$JavaHome,
 [Parameter(Mandatory=$true)][string]$PlatformJar,
 [Parameter(Mandatory=$true)][string]$BuildTools,
 [string]$SigningKey=(Join-Path $env:USERPROFILE '.android\waimai-local-test.jks')
)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$build=[IO.Path]::GetFullPath((Join-Path $root 'android\build'))
if($build -ne [IO.Path]::GetFullPath((Join-Path $root 'android\build')) -or -not $build.StartsWith($root+[IO.Path]::DirectorySeparatorChar)){throw 'Unsafe build directory'}
foreach($tool in @((Join-Path $JavaHome 'bin\java.exe'),(Join-Path $JavaHome 'bin\javac.exe'),(Join-Path $JavaHome 'bin\keytool.exe'),$PlatformJar,(Join-Path $BuildTools 'aapt2.exe'),(Join-Path $BuildTools 'zipalign.exe'),(Join-Path $BuildTools 'lib\d8.jar'),(Join-Path $BuildTools 'lib\apksigner.jar'))){if(-not(Test-Path -LiteralPath $tool -PathType Leaf)){throw "Missing build tool: $tool"}}
function Check([string]$step){if($LASTEXITCODE -ne 0){throw "$step failed with code $LASTEXITCODE"}}
Push-Location $root
try{
 # Only generated output under this repository may be removed.
 if(Test-Path -LiteralPath $build){$resolved=(Resolve-Path -LiteralPath $build).Path;if($resolved -ne $build){throw 'Build path resolution mismatch'};Remove-Item -LiteralPath $resolved -Recurse -Force}
 New-Item -ItemType Directory "$build\compiled","$build\classes","$build\dex","$build\generated" -Force|Out-Null
 node scripts/prepare-android.mjs;Check 'public assets'
 & "$BuildTools\aapt2.exe" compile --dir android/app/src/main/res -o "$build\compiled\resources.zip";Check 'resource compilation'
 & "$BuildTools\aapt2.exe" link -o "$build\unsigned.apk" -I $PlatformJar --manifest android/app/src/main/AndroidManifest.xml -A "$build\assets" --java "$build\generated" "$build\compiled\resources.zip";Check 'resource linking'
 $sources=Get-ChildItem android/app/src/main/java -Recurse -Filter '*.java'|ForEach-Object {$_.FullName}
 & "$JavaHome\bin\javac.exe" '-J-Duser.language=en' -encoding UTF-8 --release 8 -classpath $PlatformJar -d "$build\classes" $sources;Check 'Java compilation'
 $classes=Get-ChildItem "$build\classes" -Recurse -Filter '*.class'|ForEach-Object {$_.FullName}
 & "$JavaHome\bin\java.exe" -cp "$BuildTools\lib\d8.jar" com.android.tools.r8.D8 --lib $PlatformJar --min-api 26 --output "$build\dex" $classes;Check 'DEX compilation'
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 # AAPT2 on Windows can emit backslashes in asset names. Android AssetManager
 # performs exact slash-separated ZIP lookups; normalize before alignment/signing.
 $zip=[IO.Compression.ZipFile]::Open("$build\unsigned.apk",'Update')
 try{
  foreach($entry in @($zip.Entries|Where-Object {$_.FullName.Contains('\')})){
   $name=$entry.FullName.Replace('\','/')
   if($null -ne $zip.GetEntry($name)){throw "APK path normalization collision: $name"}
   $memory=[IO.MemoryStream]::new()
   try{
    $source=$entry.Open();try{$source.CopyTo($memory)}finally{$source.Dispose()}
    $entry.Delete();$replacement=$zip.CreateEntry($name,[IO.Compression.CompressionLevel]::Optimal)
    $destination=$replacement.Open();try{$memory.Position=0;$memory.CopyTo($destination)}finally{$destination.Dispose()}
   }finally{$memory.Dispose()}
  }
 }finally{$zip.Dispose()}
 $zip=[IO.Compression.ZipFile]::Open("$build\unsigned.apk",'Update');try{[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,"$build\dex\classes.dex",'classes.dex')|Out-Null}finally{$zip.Dispose()}
 & "$BuildTools\zipalign.exe" -f -p 4 "$build\unsigned.apk" "$build\aligned.apk";Check 'APK alignment'
 if(-not(Test-Path -LiteralPath $SigningKey)){New-Item -ItemType Directory (Split-Path $SigningKey -Parent) -Force|Out-Null;& "$JavaHome\bin\keytool.exe" -genkeypair -keystore $SigningKey -storepass android -keypass android -alias androiddebugkey -dname 'CN=Waimai Local Test,O=Local Development,C=CN' -keyalg RSA -keysize 2048 -validity 10000;Check 'self-use test signing key'}
 $apk="$build\waimai-assistant-standalone-test.apk"
 & "$JavaHome\bin\java.exe" -jar "$BuildTools\lib\apksigner.jar" sign --ks $SigningKey --ks-pass pass:android --ks-key-alias androiddebugkey --key-pass pass:android --out $apk "$build\aligned.apk";Check 'APK signing'
 & "$JavaHome\bin\java.exe" -jar "$BuildTools\lib\apksigner.jar" verify --verbose $apk;Check 'signature verification'
 & "$BuildTools\zipalign.exe" -c -p 4 $apk;Check 'alignment verification'
 & (Join-Path $PSScriptRoot 'verify-android-apk.ps1') -ApkPath $apk
 Get-FileHash -LiteralPath $apk -Algorithm SHA256|Format-List
 Write-Output "Built self-use TEST APK (not device-validated): $apk"
}finally{Pop-Location}
