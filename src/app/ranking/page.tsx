import Link from 'next/link';

export default function RankingPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">전체 순위</h1>
        <p className="mt-1 text-sm text-zinc-600">플랫폼/기간 필터, 인기순/내부순위/AI추천 탭을 이 페이지에 구성합니다.</p>
      </div>

      <div className="rounded-xl border border-zinc-200 p-4">
        <div className="text-sm font-medium">임시 링크</div>
        <div className="mt-2 text-sm">
          <Link className="text-blue-600 hover:underline" href="/work/demo">
            데모 작품 상세로 이동
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 p-4">
        <div className="text-sm font-medium">TODO</div>
        <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700">
          <li>FilterBar (플랫폼/장르/정렬)</li>
          <li>RankingList + 탭(인기순/내부/AI)</li>
          <li>RankingItem + WorkCard</li>
        </ul>
      </div>
    </div>
  );
}
