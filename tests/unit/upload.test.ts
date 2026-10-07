import { describe,it,expect } from "vitest";
import { validateUpload } from "../../src/lib/upload";
describe("private upload validation",()=>{
  it("accepts PDF signatures and normalizes name",()=>{
    expect(validateUpload(Buffer.from("%PDF-1.7\nDemo"),"application/pdf","../evidence.pdf")).toEqual({mimeType:"application/pdf",originalName:"evidence.pdf"});
  });
  it("rejects mismatched MIME types",()=>{expect(()=>validateUpload(Buffer.from("<script>bad</script>"),"application/pdf","fake.pdf")).toThrow();});
  it("rejects HTML and executable payloads",()=>{expect(()=>validateUpload(Buffer.from("MZ"),"application/octet-stream","run.exe")).toThrow();});
  it("rejects empty and oversized files",()=>{expect(()=>validateUpload(Buffer.alloc(0),"application/pdf","a.pdf")).toThrow();expect(()=>validateUpload(Buffer.alloc(5*1024*1024+1),"application/pdf","a.pdf")).toThrow();});
});