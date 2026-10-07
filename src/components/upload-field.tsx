"use client";
import {useRef,useState} from "react";
export default function UploadField({contractId}:{contractId:string}){
  const inputRef=useRef<HTMLInputElement>(null);
  const [files,setFiles]=useState<{url:string;name:string}[]>([]);const [pending,setPending]=useState(false);const [error,setError]=useState("");
  function setBusy(busy:boolean){
    setPending(busy);
    // Native constraint validation blocks form submission while an upload is in flight,
    // so an attachment chosen moments before submitting is never silently dropped.
    inputRef.current?.setCustomValidity(busy?"Please wait for the upload to finish before submitting.":"");
  }
  async function upload(file:File){setBusy(true);setError("");const data=new FormData();data.set("file",file);data.set("contractId",contractId);try{const r=await fetch("/api/uploads",{method:"POST",body:data});const json=await r.json();if(!r.ok)throw new Error(json.error||"Upload failed");setFiles(f=>[...f,{url:json.url,name:json.name}]);}catch(e){setError(e instanceof Error?e.message:"Upload failed");}finally{setBusy(false);}}
  return <div className="space-y-2"><label className="block text-sm font-medium">Supporting file (optional)<input ref={inputRef} type="file" accept="application/pdf,image/png,image/jpeg" disabled={pending} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);}} className="mt-2 block w-full text-sm"/></label><p className="text-xs text-zinc-500">PDF, PNG or JPEG, up to 5 MB. Private to contract participants. Local-demo storage.</p>{pending&&<p role="status" className="text-sm">Uploading…</p>}{error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}{files.map(f=><div key={f.url}><input type="hidden" name="fileUrls" value={f.url}/><p className="text-sm text-emerald-700">Attached: {f.name}</p></div>)}</div>;
}