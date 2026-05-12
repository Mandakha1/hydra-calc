import type { ReactNode } from "react";
import { STANDARDS } from "shared";
import { Card } from "../components/ui/Card";

function PageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ padding: "3rem 0", minHeight: "calc(100vh - 58px)" }}>
      <div className="container" style={{ maxWidth: 760 }}>
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function About() {
  return (
    <PageShell title="Hydra Calc-ийн тухай">
      <p>
        Hydra Calc нь Монгол улсын дулаан хангамжийн инженерүүдэд зориулсан вэб-суурьт гидравлик
        тооцоолуур юм. Энэ багажийг ДЦС-4 магистралын инженер, орон сууц барилгын төсөл зохиогч
        нарын бодит хэрэгцээнд үндэслэж хөгжүүлсэн.
      </p>
      <h3>Алсын хараа</h3>
      <p>
        Монгол инженерүүд Excel хүснэгт, гар тооцоогоор цаг алдахаа больж, стандартад нийцсэн
        мэргэжлийн тайлан гаргах боломжтой болох. Норм, стандарт нь Монгол хэл дээр, шаардлагатай
        бүх тогтмол нэгдсэн нэг багажид.
      </p>
      <h3>Нийцсэн стандартууд</h3>
      <ul>
        {Object.values(STANDARDS).map((s) => (
          <li key={s} style={{ fontFamily: "var(--font-mono)", padding: "0.25rem 0" }}>{s}</li>
        ))}
        <li style={{ fontFamily: "var(--font-mono)", padding: "0.25rem 0" }}>СП 124.13330.2012 (Тепловые сети)</li>
        <li style={{ fontFamily: "var(--font-mono)", padding: "0.25rem 0" }}>ГОСТ 10704-91 (Ган хоолой)</li>
        <li style={{ fontFamily: "var(--font-mono)", padding: "0.25rem 0" }}>ГОСТ 32415-2013 (PPR)</li>
        <li style={{ fontFamily: "var(--font-mono)", padding: "0.25rem 0" }}>ГОСТ 18599-2001 (PE-HD)</li>
      </ul>
    </PageShell>
  );
}

export function Pricing() {
  return (
    <PageShell title="Үнэ">
      <Card>
        <div style={{ fontSize: 48, fontWeight: 700, color: "var(--accent)" }}>₮0 / сар</div>
        <p style={{ fontSize: 16, color: "var(--fg-muted)" }}>
          Одоогоор Hydra Calc бүрэн үнэгүй. Cloud хадгалалт, норм шалгалт, экспорт, хуваалцах — бүгд багтсан.
        </p>
        <p>
          Удахгүй зах зээлд гарах Pro төлөвлөгөөнд: хамтын ажиллагаа, төслийн түүх, PDF тайлан, API хандалт багтана.
        </p>
      </Card>
    </PageShell>
  );
}

export function Docs() {
  return (
    <PageShell title="Гарын авлага">
      <p>Дэлгэрэнгүй баримт бичиг удахгүй нэмэгдэнэ.</p>
      <h3>Яаралтай холбоосууд</h3>
      <ul>
        <li><a href="https://docs.cntd.ru/document/1200095545" target="_blank" rel="noreferrer">СП 124.13330.2012 — Тепловые сети (бүрэн эх)</a></li>
        <li><a href="https://legalinfo.mn/mn/detail?lawId=211242" target="_blank" rel="noreferrer">БНбД 23-02-09 — Барилгын дулаан хамгаалалт</a></li>
        <li><a href="https://mcis.gov.mn/mn/norm" target="_blank" rel="noreferrer">Монгол барилгын норм, дүрмийн албан ёсны цахим сан</a></li>
      </ul>
      <h3>Контакт</h3>
      <p>Асуулт, санал: <a href="mailto:hello@example.com">hello@example.com</a></p>
    </PageShell>
  );
}
