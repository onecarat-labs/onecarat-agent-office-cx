$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$env:TEMP = Join-Path $projectRoot '.cx/v11-tests/tmp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.IO;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Collections.Generic;
public static class OfficeIconBuilder {
 public static void Build(string source,string target){
  int[] sizes={16,20,24,32,40,48,64,128,256};var frames=new List<byte[]>();
  using(var original=Image.FromFile(source))foreach(int size in sizes){
   using(var bitmap=new Bitmap(size,size,PixelFormat.Format32bppArgb)){
    using(var g=Graphics.FromImage(bitmap)){g.Clear(Color.Transparent);g.CompositingMode=CompositingMode.SourceCopy;g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.PixelOffsetMode=PixelOffsetMode.HighQuality;g.DrawImage(original,new Rectangle(0,0,size,size));}
    using(var memory=new MemoryStream()){bitmap.Save(memory,ImageFormat.Png);frames.Add(memory.ToArray());}
    bitmap.Save(Path.Combine(Path.GetDirectoryName(target),"preview-"+size+".png"),ImageFormat.Png);
   }
  }
  using(var writer=new BinaryWriter(File.Create(target))){writer.Write((ushort)0);writer.Write((ushort)1);writer.Write((ushort)sizes.Length);int offset=6+16*sizes.Length;
   for(int i=0;i<sizes.Length;i++){writer.Write((byte)(sizes[i]==256?0:sizes[i]));writer.Write((byte)(sizes[i]==256?0:sizes[i]));writer.Write((byte)0);writer.Write((byte)0);writer.Write((ushort)1);writer.Write((ushort)32);writer.Write(frames[i].Length);writer.Write(offset);offset+=frames[i].Length;}
   foreach(var frame in frames)writer.Write(frame);
  }
 }
}
'@
[OfficeIconBuilder]::Build((Join-Path $projectRoot 'assets/icon/onecarat-office-source.png'),(Join-Path $projectRoot 'assets/icon/onecarat-office.ico'))
Write-Output 'Created ICO with 16,20,24,32,40,48,64,128,256 pixel frames.'
