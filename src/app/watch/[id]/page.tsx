import VideoPlayer from '@/components/VideoPlayer';

type Props = { params: Promise<{ id: string }> };

/**
 * Full-screen player route. All data is fetched client-side so the page
 * shell loads instantly and 404s are handled in the UI.
 */
export default async function WatchPage({ params }: Props) {
  const { id } = await params;
  const num = /^\d{1,10}$/.test(id) ? Number(id) : NaN;
  if (!Number.isFinite(num) || num <= 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-lg font-medium">Invalid video id</p>
        <a href="/" className="text-blue-400 hover:underline">
          Back to library
        </a>
      </div>
    );
  }
  return <VideoPlayer id={num} />;
}
