# Jenkins en el VPS

Jenkins solo despliega la telemetría ([ARCHITECTURE.md §19.6](../../ARCHITECTURE.md)). Consulta cada 5 minutos la
rama `deployment` y, por cada commit nuevo, espera sus imágenes en GHCR y corre `infra/telemetry/deploy.sh` en el
host por SSH. Si el deploy falla, vuelve a desplegar la versión anterior.

| Archivo | Qué es |
|---|---|
| `Dockerfile` | `jenkins/jenkins` LTS con los plugins y la configuración adentro, sin asistente de instalación |
| `plugins.txt` | Plugins que instala la imagen |
| `jenkins.yaml` | JCasC: el único usuario, sin acceso anónimo; la credencial `vps-ssh`; el job `careerly-telemetry-deploy` (Job DSL) |
| `Jenkinsfile` | El pipeline de deploy |
| `compose.yaml` | Proyecto `careerly-jenkins`: puerto solo en `127.0.0.1:8080`, heap de 512 MB, clave y `known_hosts` como secrets |
| `.env.example` | Variables del `.env` del VPS |

## Primera vez

Con la telemetría ya instalada (`infra/telemetry/README.md`), como el usuario que despliega:

```bash
mkdir -p ~/careerly/jenkins && cd ~/careerly/jenkins
# Una clave solo para Jenkins, autorizada para entrar al mismo usuario.
ssh-keygen -q -t ed25519 -N '' -C careerly-jenkins -f id_ed25519
cat id_ed25519.pub >> ~/.ssh/authorized_keys
# La clave del host, para que Jenkins verifique a quién se conecta.
ssh-keyscan -p 5141 127.0.0.1 2>/dev/null | sed 's/^[^ ]*/careerly-vps/' > known_hosts
cp ~/careerly/repo/infra/jenkins/.env.example .env && chmod 600 .env
# Completar JENKINS_ADMIN_PASSWORD (openssl rand -hex 24).
docker compose --env-file .env -f ~/careerly/repo/infra/jenkins/compose.yaml up -d --build
```

El contenedor corre con el uid 1000: la clave y el `known_hosts` tienen que ser legibles por ese uid, que en este
VPS es el mismo usuario.

## Entrar

Jenkins no se publica. Desde tu PC:

```bash
ssh -p 5141 -L 8080:127.0.0.1:8080 <usuario>@<vps>
```

y después `http://localhost:8080`, con el usuario y la contraseña del `.env`.

## Recrearlo desde cero

```bash
docker compose --env-file ~/careerly/jenkins/.env -f ~/careerly/repo/infra/jenkins/compose.yaml down -v
docker compose --env-file ~/careerly/jenkins/.env -f ~/careerly/repo/infra/jenkins/compose.yaml up -d --build
```

Vuelve con el usuario, la credencial y el job. Se pierde solo el historial de builds.
