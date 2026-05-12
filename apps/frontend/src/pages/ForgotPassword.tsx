import { AuthShell } from "./Login";

export function ForgotPassword() {
  return (
    <AuthShell title="Нууц үг мартсан">
      <p style={{ color: "var(--fg-muted)", fontSize: 14 }}>
        Одоогоор автомат нууц үг сэргээх боломж нэмэгдэж байна. <br />
        <br />
        Одоохондоо <a href="mailto:hello@example.com">hello@example.com</a> хаягаар холбогдоод,
        бүртгэлтэй и-мэйлээ илгээнэ үү. Админ 24 цагийн дотор шинэ нууц үг гаргаж өгнө.
      </p>
    </AuthShell>
  );
}
