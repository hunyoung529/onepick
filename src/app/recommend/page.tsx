import Link from 'next/link';

export default function RecommendationPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">AI 추천 결과</h1>
        <p className="mt-1 text-sm text-zinc-600">“당신을 위한 5작품” + 선택에 따른 이유 설명/유사작품</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 5 }).map((_, idx) => (
          <div key={idx} className="rounded-2xl border border-zinc-200 p-4">
            <div className="text-sm text-zinc-500">추천 #{idx + 1}</div>
            <div className="mt-2 h-36 rounded-xl bg-zinc-100" />
            <div className="mt-3 text-sm font-medium">추천 이유</div>
            <p className="mt-1 text-sm text-zinc-700">(임시) 사용자의 찜/댓글/선호 장르 기반으로 추천됩니다.</p>
            <div className="mt-3">
              <Link className="text-sm text-blue-600 hover:underline" href={`/work/reco-${idx + 1}`}>
                상세 보기
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
