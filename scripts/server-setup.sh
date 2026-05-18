#!/bin/bash
set -e

echo "=== VEX Central de Gestão — Server Setup ==="

# 1. Atualizar sistema
apt-get update -y && apt-get upgrade -y
apt-get install -y curl wget git apt-transport-https ca-certificates gnupg

# 2. Instalar Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker && systemctl start docker

# 3. Inicializar Docker Swarm
docker swarm init --advertise-addr $(hostname -I | awk '{print $1}')

# 4. Criar rede overlay para Traefik
docker network create --driver overlay --attachable traefik-public

# 5. Criar diretório da aplicação
mkdir -p /opt/vex

# 6. Gerar SSH key para GitHub Actions
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N "" -C "github-actions-deploy"
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

echo ""
echo "=== COPIE A CHAVE ABAIXO PARA O SECRET 'SERVER_SSH_KEY' NO GITHUB ==="
echo ""
cat ~/.ssh/github_deploy
echo ""
echo "=== SETUP CONCLUÍDO ==="
echo ""
echo "Próximos passos:"
echo "1. Copie a chave privada acima para GitHub Secrets → SERVER_SSH_KEY"
echo "2. Copie o docker-compose.infra.yml para o servidor:"
echo "   scp docker-compose.infra.yml root@$(hostname -I | awk '{print $1}'):/opt/vex/"
echo "3. Deploy da infraestrutura:"
echo "   docker stack deploy -c /opt/vex/docker-compose.infra.yml infra"
echo "4. Acesse o Portainer: https://$(hostname -I | awk '{print $1}'):9443"
