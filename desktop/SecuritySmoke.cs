using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Web.Script.Serialization;
static class SecuritySmoke {
 static bool Reject(Action action){try{action();return false;}catch{return true;}}
 static int Main(string[] args){string root=args[0];Directory.CreateDirectory(root);var results=new Dictionary<string,bool>();
  string app=Path.Combine(root,"app"),cwd=Path.Combine(root,"cwd"),trusted=Path.Combine(root,"trusted");foreach(string dir in new[]{app,cwd,trusted}){Directory.CreateDirectory(dir);File.WriteAllText(Path.Combine(dir,"node.exe"),"");}
  results["rejectRelativeOverride"]=Reject(()=>ObserverSecurity.ResolveNode(app,cwd,"node.exe",trusted));
  results["rejectOtherExecutable"]=Reject(()=>ObserverSecurity.ResolveNode(app,cwd,Path.Combine(trusted,"other.exe"),trusted));
  results["rejectMissingOverride"]=Reject(()=>ObserverSecurity.ResolveNode(app,cwd,Path.Combine(root,"missing","node.exe"),trusted));
  results["skipApplicationAndCurrentDirectories"]=Reject(()=>ObserverSecurity.ResolveNode(app,cwd,null,app+";"+cwd+";."));
  results["useAbsolutePathCandidate"]=ObserverSecurity.ResolveNode(app,cwd,null,app+";"+cwd+";"+trusted)==Path.Combine(trusted,"node.exe");
  var source=new Hashtable{{"Path",trusted},{"SystemRoot","C:\\Windows"},{"NODE_OPTIONS","secret"},{"OTHER_TOKEN","secret"},{"CX_NODE_EXE","evil.exe"},{"CX_SESSIONS_DIR",root}};var clean=ObserverSecurity.CleanEnvironment(source);
  results["allowlistedEnvironmentOnly"]=clean.Count==3&&clean.ContainsKey("PATH")&&!clean.ContainsKey("NODE_OPTIONS")&&!clean.ContainsKey("OTHER_TOKEN")&&!clean.ContainsKey("CX_NODE_EXE");
  results["fixedEnums"]=ObserverSecurity.Activity("constructor")=="unknown"&&ObserverSecurity.Status("__proto__")=="unavailable"&&ObserverSecurity.Approval("bogus")=="uncertain";
  File.WriteAllText(Path.Combine(root,"results.json"),new JavaScriptSerializer().Serialize(results));foreach(bool pass in results.Values)if(!pass)return 1;return 0;
 }
}
