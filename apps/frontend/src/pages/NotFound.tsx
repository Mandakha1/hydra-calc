import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";

export function NotFound() {
  return (
    <div style={{ padding: "5rem 1.5rem", textAlign: "center" }}>
      <div style={{ fontSize: 72, fontFamily: "var(--font-mono)", color: "var(--accent)" }}>404</div>
      <h2>Хуудас олдсонгүй</h2>
      <p>Энэ хаяг байхгүй эсвэл таны хандах эрхгүй.</p>
      <Link to="/">
        <Button size="lg" variant="secondary">← Буцах</Button>
      </Link>
    </div>
  );
}
