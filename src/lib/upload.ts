export function validateUpload(data:Buffer,mime:string,name:string){
  if(!data.length||data.length>5*1024*1024)throw new Error("Files must be between 1 byte and 5 MB.");
  const pdf=data.subarray(0,5).toString()==="%PDF-";
  const png=data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg=data[0]===255&&data[1]===216&&data[2]===255;
  if(!((mime==="application/pdf"&&pdf)||(mime==="image/png"&&png)||(mime==="image/jpeg"&&jpeg)))throw new Error("Only PDF, PNG and JPEG with matching file signatures are allowed.");
  const originalName=(name.replaceAll("\\","/").split("/").at(-1)??"attachment").replace(/[^a-zA-Z0-9._ -]/g,"_").slice(0,120)||"attachment";
  return {mimeType:mime,originalName};
}