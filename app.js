const API_BASE_URL = 'https://ideya-backend.vercel.app'; 

let categoriaAtual = null;
let map = null;
let markersLayer = null;
let mapaVisivelMobile = false;

// Inicializar Ícones e Mapa ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    inicializarMapa();
    atualizarCalculoLocal();
    buscarIdeyas();
});

// 1. Configurar Mapa Leaflet centrado em Luanda
function inicializarMapa() {
    map = L.map('map', { zoomControl: false }).setView([-8.8147, 13.2302], 13);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Tiles gratuitos, sem chave API
    L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
        subdomains: 'abc',
        attribution: '&copy; OpenStreetMap &copy; Humanitarian OSM',
        maxZoom: 19
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);
}

// 2. Atualizar cálculo em tempo real no badge verde
function atualizarCalculoLocal() {
    const orcamento = parseInt(document.getElementById('input-orcamento').value) || 0;
    const pessoas = parseInt(document.getElementById('input-pessoas').value) || 1;
    const porPessoa = Math.floor(orcamento / Math.max(1, pessoas));
    
    document.getElementById('badge-por-pessoa').innerText = `${formatarKz(porPessoa)} / pessoa`;
}

// 3. Selecionar Categoria
function selecionarCategoria(categoria, elementoBtn) {
    categoriaAtual = categoria;
    
    // Atualizar estilo visual dos botões
    document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.classList.remove('active', 'text-slateDark', 'border-slateDark', 'font-semibold');
        btn.classList.add('text-slate-500', 'border-transparent', 'font-medium');
    });
    elementoBtn.classList.remove('text-slate-500', 'border-transparent', 'font-medium');
    elementoBtn.classList.add('active', 'text-slateDark', 'border-slateDark', 'font-semibold');

    buscarIdeyas();
}

// 4. Comunicar com POST /criar-ideya da FastAPI
async function buscarIdeyas() {
    const orcamento = parseInt(document.getElementById('input-orcamento').value) || 30000;
    const pessoas = parseInt(document.getElementById('input-pessoas').value) || 4;
    const zona = document.getElementById('input-zona').value || null;

    const payload = {
        orcamento_total: orcamento,
        num_pessoas: pessoas,
        zona: zona,
        categoria: categoriaAtual
    };

    try {
        const resposta = await fetch(`${API_BASE_URL}/criar-ideya`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!resposta.ok) throw new Error('Erro ao buscar locais na API');

        const dados = await resposta.json();
        renderizarLocais(dados.locais, dados.valor_por_pessoa);
    } catch (erro) {
        console.error(erro);
        document.getElementById('contador-resultados').innerText = 'Erro ao ligar à API FastAPI. Verifica se o servidor está a correr.';
    }
}

// 5. Renderizar Cartões na Lista e Pins no Mapa
function renderizarLocais(locais, valorPorPessoa) {
    const grid = document.getElementById('grid-locais');
    const contador = document.getElementById('contador-resultados');
    grid.innerHTML = '';
    markersLayer.clearLayers();

    if (!locais || locais.length === 0) {
        contador.innerText = `Nenhum local encontrado até ${formatarKz(valorPorPessoa)} por pessoa.`;
        grid.innerHTML = `
            <div class="col-span-full bg-white rounded-2xl p-8 text-center border border-slate-200">
                <p class="font-semibold text-slateDark">Orçamento apertado para esta zona ou categoria 😅</p>
                <p class="text-sm text-slate-500 mt-1">Tenta aumentar o orçamento total, reduzir o número de pessoas ou limpar os filtros.</p>
            </div>`;
        return;
    }

    contador.innerText = `${locais.length} ${locais.length === 1 ? 'lugar encontrado' : 'lugares encontrados'} dentro do teu orçamento`;

    const bounds = [];

    locais.forEach(local => {
        const fotoUrl = (local.fotos && local.fotos.length > 0) 
            ? local.fotos[0] 
            : 'https://unsplash.com';

        // Criar Cartão HTML
        const card = document.createElement('article');
        card.className = 'bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm hover:shadow-md transition group cursor-pointer flex flex-col';
        card.innerHTML = `
            <div class="relative h-44 overflow-hidden bg-slate-100">
                <img src="${fotoUrl}" alt="${local.nome}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
                <span class="absolute top-3 left-3 bg-white/90 backdrop-blur-xs text-slateDark text-xs font-semibold px-2.5 py-1 rounded-full">
                    ${local.categoria}
                </span>
            </div>
            <div class="p-4 flex-1 flex flex-col justify-between">
                <div>
                    <div class="flex items-start justify-between gap-2">
                        <h3 class="font-display font-bold text-base text-slateDark leading-snug">${local.nome}</h3>
                        <span class="bg-slateDark text-white text-xs font-bold px-2.5 py-1 rounded-lg shrink-0">
                            ${formatarKz(local.preco_medio_pessoa)}
                        </span>
                    </div>
                    <p class="text-xs font-medium text-slate-400 mt-0.5 flex items-center gap-1">
                        <i data-lucide="map-pin" class="w-3 h-3"></i> ${local.zona}
                    </p>
                    <p class="text-xs text-slate-600 mt-2.5 line-clamp-2">
                       Notas ${local.notas_rapidas || 'Excelente opção em Luanda dentro do orçamento do grupo.'}
                    </p>
                </div>
            </div>
        `;

        // Ao passar o rato no cartão, foca no pin do mapa
        card.addEventListener('mouseenter', () => {
            if (local.latitude && local.longitude) {
                map.panTo([local.latitude, local.longitude]);
            }
        });

        grid.appendChild(card);

        // Adicionar Pin com Preço no Mapa se houver coordenadas
        if (local.latitude && local.longitude) {
            const customIcon = L.divIcon({
                className: 'custom-leaflet-div',
                html: `<div class="price-pin">${formatarKz(local.preco_medio_pessoa)}</div>`,
                iconSize: [80, 36],
                iconAnchor: [40, 15]
            });

            const marker = L.marker([local.latitude, local.longitude], { icon: customIcon })
                .bindPopup(`<b>${local.nome}</b><br>${local.zona} • ${formatarKz(local.preco_medio_pessoa)}/pessoa`);
            
            markersLayer.addLayer(marker);
            bounds.push([local.latitude, local.longitude]);
        }
    });

    lucide.createIcons();

    // Ajustar zoom do mapa para mostrar todos os pins encontrados
    if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    }
}

// 6. Acionar Modal "Surpreenda-me" (POST /surpreenda-me com IA)
async function acionarSurpreendaMe() {
    const modal = document.getElementById('modal-ia');
    const loading = document.getElementById('modal-ia-loading');
    const conteudo = document.getElementById('modal-ia-conteudo');

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    loading.classList.remove('hidden');
    conteudo.classList.add('hidden');

    const payload = {
        orcamento_total: parseInt(document.getElementById('input-orcamento').value) || 30000,
        num_pessoas: parseInt(document.getElementById('input-pessoas').value) || 4,
        zona: document.getElementById('input-zona').value || null,
        categoria: categoriaAtual
    };

    try {
        const resposta = await fetch(`${API_BASE_URL}/surpreenda-me`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            throw new Error(dados.detail || 'Não foi possível gerar uma sugestão.');
        }

        const local = dados.local;
        const fotoUrl = (local.fotos && local.fotos.length > 0) 
            ? local.fotos[0] 
            : 'https://unsplash.com';

        document.getElementById('ia-local-foto').src = fotoUrl;
        document.getElementById('ia-local-preco').innerText = `${formatarKz(local.preco_medio_pessoa)} / pessoa`;
        document.getElementById('ia-local-categoria').innerText = local.categoria;
        document.getElementById('ia-local-zona').innerText = local.zona;
        document.getElementById('ia-local-nome').innerText = local.nome;
        document.getElementById('ia-justificativa').innerText = `"${dados.justificativa}"`;

        // Link direto para abrir rota no Google Maps
        const queryMaps = local.latitude && local.longitude 
            ? `${local.latitude},${local.longitude}` 
            : encodeURIComponent(`${local.nome} Luanda Angola`);
        document.getElementById('ia-btn-maps').href =
            `https://www.google.com/maps/search/?api=1&query=${queryMaps}`;

        loading.classList.add('hidden');
        conteudo.classList.remove('hidden');
    } catch (erro) {
        alert(erro.message);
        fecharModalIA();
    }
}

function fecharModalIA() {
    const modal = document.getElementById('modal-ia');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// Alternar Lista/Mapa no Telemóvel
function alternarMapaMobile() {
    const lista = document.getElementById('lista-container');
    const mapaContainer = document.getElementById('mapa-container');
    const botao = document.getElementById('btn-toggle-mapa');
    const textoBotao = botao ? botao.querySelector('span') : null;
    if (!lista || !mapaContainer) return;

    mapaVisivelMobile = !mapaVisivelMobile;
    lista.classList.toggle('hidden', mapaVisivelMobile);
    mapaContainer.classList.toggle('hidden', !mapaVisivelMobile);

    if (botao) botao.setAttribute('aria-pressed', String(mapaVisivelMobile));
    if (textoBotao) textoBotao.textContent = mapaVisivelMobile ? 'Ver Lista' : 'Ver no Mapa';

    if (mapaVisivelMobile && map) {
        requestAnimationFrame(() => {
            map.invalidateSize();
            map.setView(map.getCenter(), map.getZoom(), { animate: false });
        });
    }
}

function formatarKz(valor) {
    return new Intl.NumberFormat('pt-AO', {
        style: 'currency',
        currency: 'AOA',
        maximumFractionDigits: 0
    }).format(Number(valor) || 0);
}