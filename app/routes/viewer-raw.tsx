export async function loader({ params }: { params: { fileName: string } }) {
  return new Response(null, {
    status: 302,
    headers: { Location: `/api/raw/${params.fileName}` },
  });
}

export default function RawViewer() {
  return null;
}
