# Deploy — Oracle Always Free

Final hardened version produced in Faza 6-8. Use this file as running notes.

## 1. Provision VM

1. [cloud.oracle.com](https://cloud.oracle.com) → Always Free
2. Compute → Instances → Create
   - Name: `hydra-calc-prod`
   - Image: Canonical Ubuntu 22.04 (ARM64)
   - Shape: `VM.Standard.A1.Flex` — 4 OCPU / 24 GB RAM (Always Free)
   - Public IP: Yes
   - SSH key: upload `~/.ssh/id_ed25519.pub`
   - Advanced → User data: paste [deploy/cloud-init.yaml](./deploy/cloud-init.yaml)
3. Security List → Add Ingress:
   - `0.0.0.0/0 TCP 80`
   - `0.0.0.0/0 TCP 443`

## 2. Fix Oracle iptables (one-time)

```bash
ssh ubuntu@<public-ip>
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## 3. Deploy

```bash
cd /opt/hydra-calc
git clone <your-repo> .
mkdir -p deploy/secrets
openssl rand -base64 32 > deploy/secrets/pg_password.txt
openssl rand -base64 48 > deploy/secrets/jwt_secret.txt
chmod 600 deploy/secrets/*.txt
cp .env.example .env
# Edit .env: DOMAIN, ADMIN_EMAIL, ADMIN_BOOTSTRAP_*
cd deploy
docker compose up -d
docker compose logs -f caddy  # wait for "certificate obtained"
```

## 4. DNS

```
A  @    <oracle-vm-public-ip>   TTL 300
A  www  <oracle-vm-public-ip>   TTL 300
```

## 5. Migrate + seed

```bash
docker compose exec api pnpm db:push
docker compose exec api pnpm seed:admin
```

## 6. Smoke test

See checklist at the end of [claude_code_prompt.md](./claude_code_prompt.md) Faza 8.

## Backup + restore

Cron (`0 3 * * *`): [deploy/backup.sh](./deploy/backup.sh)
Restore: [deploy/restore.sh](./deploy/restore.sh)
