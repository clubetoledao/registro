// Banco de dados local
class Database {
    constructor() {
        this.dbName = 'ToledoDB';
        this.dbVersion = 3;
        this.db = null;
        this.init();
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('Erro ao abrir banco');
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('Banco conectado');
                this.atualizarStats();
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (db.objectStoreNames.contains('alunos')) {
                    db.deleteObjectStore('alunos');
                }
                
                const store = db.createObjectStore('alunos', { keyPath: 'nome' });
                store.createIndex('nome', 'nome', { unique: true });
                store.createIndex('dataCadastro', 'dataCadastro', { unique: false });
                
                console.log('Store de alunos recriada');
            };
        });
    }

    async atualizarStats() {
        const alunos = await this.getAlunos();
        const totalEl = document.getElementById('totalAlunos');
        const bloqueadosEl = document.getElementById('totalBloqueados');
        
        if (totalEl) totalEl.textContent = alunos.length;
        if (bloqueadosEl) {
            const bloqueados = alunos.filter(a => (a.remarcacoes?.length || 0) >= 3).length;
            bloqueadosEl.textContent = bloqueados;
        }
    }

    async getAlunos() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['alunos'], 'readonly');
            const store = transaction.objectStore('alunos');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async getAluno(nome) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['alunos'], 'readonly');
            const store = transaction.objectStore('alunos');
            const request = store.get(nome);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async searchAlunos(termo) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['alunos'], 'readonly');
            const store = transaction.objectStore('alunos');
            const request = store.getAll();

            request.onsuccess = () => {
                const alunos = request.result || [];
                const termoLower = termo.toLowerCase().trim();
                
                if (!termoLower) {
                    resolve([]);
                    return;
                }

                const resultados = alunos.filter(aluno => 
                    aluno.nome.toLowerCase().includes(termoLower)
                );
                
                resolve(resultados);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async adicionarRemarcacao(nome, motivo) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['alunos'], 'readwrite');
            const store = transaction.objectStore('alunos');
            
            const getRequest = store.get(nome);
            
            getRequest.onsuccess = () => {
                const aluno = getRequest.result;
                if (!aluno) {
                    reject(new Error('Aluno não encontrado'));
                    return;
                }

                const remarcacao = {
                    id: Date.now(),
                    motivo: motivo.trim(),
                    data: new Date().toLocaleString('pt-BR'),
                    timestamp: Date.now()
                };

                if (!aluno.remarcacoes) {
                    aluno.remarcacoes = [];
                }

                aluno.remarcacoes.push(remarcacao);

                const putRequest = store.put(aluno);
                
                putRequest.onsuccess = () => {
                    this.atualizarStats();
                    resolve(aluno);
                };
                putRequest.onerror = () => reject(putRequest.error);
            };
            
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async removerRemarcacao(nome, remarcacaoId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['alunos'], 'readwrite');
            const store = transaction.objectStore('alunos');
            
            const getRequest = store.get(nome);
            
            getRequest.onsuccess = () => {
                const aluno = getRequest.result;
                if (!aluno) {
                    reject(new Error('Aluno não encontrado'));
                    return;
                }

                aluno.remarcacoes = aluno.remarcacoes.filter(r => r.id !== remarcacaoId);

                const putRequest = store.put(aluno);
                
                putRequest.onsuccess = () => {
                    this.atualizarStats();
                    resolve(aluno);
                };
                putRequest.onerror = () => reject(putRequest.error);
            };
            
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async criarAluno(nome) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['alunos'], 'readwrite');
            const store = transaction.objectStore('alunos');
            
            const checkRequest = store.get(nome);
            
            checkRequest.onsuccess = () => {
                if (checkRequest.result) {
                    reject(new Error('Aluno já cadastrado'));
                    return;
                }

                const aluno = {
                    nome: nome.toUpperCase().trim(),
                    remarcacoes: [],
                    dataCadastro: new Date().toISOString()
                };

                const putRequest = store.put(aluno);
                
                putRequest.onsuccess = () => {
                    this.atualizarStats();
                    resolve(aluno);
                };
                putRequest.onerror = () => reject(putRequest.error);
            };
            
            checkRequest.onerror = () => reject(checkRequest.error);
        });
    }
}

// Aplicação
class App {
    constructor() {
        this.db = new Database();
        this.currentAluno = null;
        this.init();
    }

    async init() {
        await this.db.init();
        this.setupEventListeners();
        this.carregarLista();
        
        const lastAluno = localStorage.getItem('lastAluno');
        if (lastAluno) {
            try {
                const aluno = await this.db.getAluno(lastAluno);
                if (aluno) this.selecionarAluno(aluno.nome);
            } catch (e) {
                console.log('Sem aluno recente');
            }
        }
    }

    setupEventListeners() {
        const searchInput = document.getElementById('searchInput');
        
        document.getElementById('addNewStudentBtn').addEventListener('click', () => this.novoAluno());
        document.getElementById('addRemarcacaoBtn').addEventListener('click', () => this.adicionarRemarcacao());
        document.getElementById('refreshListBtn').addEventListener('click', () => {
            this.carregarLista();
            this.db.atualizarStats();
        });
        document.getElementById('exportBtn').addEventListener('click', () => this.exportarDados());
        
        searchInput.addEventListener('input', () => this.buscar());
        searchInput.addEventListener('focus', () => this.buscar());
        
        document.addEventListener('click', (e) => {
            const suggestions = document.getElementById('suggestions');
            if (!searchInput.contains(e.target) && !suggestions.contains(e.target)) {
                suggestions.classList.remove('active');
            }
        });
    }

    async buscar() {
        const termo = document.getElementById('searchInput').value;
        const suggestions = document.getElementById('suggestions');

        if (termo.length < 2) {
            suggestions.classList.remove('active');
            return;
        }

        try {
            const resultados = await this.db.searchAlunos(termo);
            this.mostrarSugestoes(resultados, termo);
        } catch (error) {
            console.error('Erro na busca');
        }
    }

    mostrarSugestoes(alunos, termo) {
        const suggestions = document.getElementById('suggestions');
        
        if (alunos.length === 0) {
            suggestions.innerHTML = `
                <div class="suggestion-item" onclick="app.novoAlunoComNome('${termo}')">
                    <strong><i class="fas fa-plus-circle"></i> Adicionar "${termo}"</strong>
                    <small>Clique para cadastrar</small>
                </div>
            `;
        } else {
            suggestions.innerHTML = alunos.map(aluno => `
                <div class="suggestion-item" onclick="app.selecionarAluno('${aluno.nome}')">
                    <div>
                        <strong>${aluno.nome}</strong>
                        <br>
                        <small>${aluno.remarcacoes?.length || 0}/3 remarcações</small>
                    </div>
                    <i class="fas fa-chevron-right"></i>
                </div>
            `).join('');
        }
        
        suggestions.classList.add('active');
    }

    novoAluno() {
        const nome = prompt("Digite o NOME completo do aluno:");
        if (!nome) return;
        this.criarAluno(nome);
    }

    novoAlunoComNome(sugestaoNome) {
        this.criarAluno(sugestaoNome);
    }

    async criarAluno(nome) {
        try {
            const aluno = await this.db.criarAluno(nome);
            document.getElementById('suggestions').classList.remove('active');
            document.getElementById('searchInput').value = '';
            this.selecionarAluno(aluno.nome);
            this.notificar('✅ Aluno cadastrado com sucesso!', 'success');
            this.carregarLista();
        } catch (error) {
            this.notificar('❌ Erro: ' + error.message, 'error');
        }
    }

    async selecionarAluno(nome) {
        try {
            const aluno = await this.db.getAluno(nome);
            if (aluno) {
                this.currentAluno = aluno;
                this.mostrarAluno(aluno);
                document.getElementById('suggestions').classList.remove('active');
                document.getElementById('searchInput').value = aluno.nome;
                localStorage.setItem('lastAluno', aluno.nome);
            }
        } catch (error) {
            this.notificar('Erro ao selecionar aluno', 'error');
        }
    }

    mostrarAluno(aluno) {
        const studentInfo = document.getElementById('studentInfo');
        if (!studentInfo) return;
        
        document.getElementById('studentName').textContent = aluno.nome;
        
        const studentCode = document.getElementById('studentCode');
        if (studentCode) {
            studentCode.style.display = 'none';
        }
        
        const numRemarcacoes = aluno.remarcacoes?.length || 0;
        const countSpan = document.getElementById('remarcacoesCount');
        if (countSpan) {
            countSpan.textContent = `${numRemarcacoes}/3`;
        }

        const blockStatus = document.getElementById('blockStatus');
        const addBtn = document.getElementById('addRemarcacaoBtn');
        
        if (blockStatus) {
            blockStatus.style.display = numRemarcacoes >= 3 ? 'flex' : 'none';
        }
        
        if (addBtn) {
            addBtn.disabled = numRemarcacoes >= 3;
        }

        const historicoList = document.getElementById('historicoList');
        if (historicoList) {
            if (numRemarcacoes > 0) {
                const historico = [...aluno.remarcacoes].sort((a,b) => b.timestamp - a.timestamp);
                historicoList.innerHTML = historico.map(r => `
                    <div class="historico-item">
                        <div>
                            <span class="historico-motivo">${r.motivo}</span>
                            <button class="btn-delete-historico" onclick="app.confirmarRemoverRemarcacao('${aluno.nome}', ${r.id})" title="Excluir remarcação">
                                <i class="fas fa-times"></i>
                            </button>
                            <span class="historico-data">${r.data}</span>
                        </div>
                    </div>
                `).join('');
            } else {
                historicoList.innerHTML = '<div class="historico-item">Nenhuma remarcação registrada</div>';
            }
        }

        studentInfo.style.display = 'block';
    }

    async confirmarRemoverRemarcacao(nome, remarcacaoId) {
        if (confirm('Tem certeza que deseja excluir esta remarcação?')) {
            try {
                const aluno = await this.db.removerRemarcacao(nome, remarcacaoId);
                this.currentAluno = aluno;
                this.mostrarAluno(aluno);
                this.notificar('✅ Remarcação excluída com sucesso!', 'success');
                this.carregarLista();
            } catch (error) {
                this.notificar('❌ Erro ao excluir remarcação', 'error');
            }
        }
    }

    async adicionarRemarcacao() {
        if (!this.currentAluno) {
            this.notificar('Selecione um aluno primeiro', 'warning');
            return;
        }

        const motivo = document.getElementById('motivoInput').value.trim();
        if (!motivo) {
            this.notificar('Digite o motivo da remarcação', 'warning');
            return;
        }

        if (this.currentAluno.remarcacoes?.length >= 3) {
            this.notificar('Aluno já está bloqueado!', 'error');
            return;
        }

        try {
            const aluno = await this.db.adicionarRemarcacao(this.currentAluno.nome, motivo);
            this.currentAluno = aluno;
            this.mostrarAluno(aluno);
            document.getElementById('motivoInput').value = '';
            this.notificar('✅ Remarcação registrada com sucesso!', 'success');
            this.carregarLista();

            if (aluno.remarcacoes.length === 3) {
                this.notificar('⚠️ Aluno bloqueado! Atingiu 3 remarcações.', 'warning');
            }
        } catch (error) {
            this.notificar('Erro ao registrar remarcação', 'error');
        }
    }

    async carregarLista() {
        try {
            const alunos = await this.db.getAlunos();
            const comRemarcacoes = alunos.filter(a => a.remarcacoes?.length > 0);
            
            const list = document.getElementById('studentsList');
            if (!list) return;
            
            if (comRemarcacoes.length === 0) {
                list.innerHTML = '<div class="empty-state"><i class="fas fa-users-slash"></i><p>Nenhum aluno com remarcações</p></div>';
                return;
            }

            list.innerHTML = comRemarcacoes
                .sort((a,b) => (b.remarcacoes?.length || 0) - (a.remarcacoes?.length || 0))
                .map(aluno => `
                    <div class="student-item" onclick="app.selecionarAluno('${aluno.nome}')">
                        <div class="student-item-info">
                            <h4>${aluno.nome}</h4>
                            <p>${aluno.remarcacoes?.length || 0} remarcação(s)</p>
                        </div>
                        <span class="student-item-badge ${aluno.remarcacoes?.length >= 3 ? 'blocked' : ''}">
                            ${aluno.remarcacoes?.length || 0}/3
                        </span>
                    </div>
                `).join('');
        } catch (error) {
            console.error('Erro ao carregar lista');
        }
    }

    exportarDados() {
        this.db.getAlunos().then(alunos => {
            const dados = {
                data: new Date().toLocaleString(),
                total: alunos.length,
                alunos: alunos
            };
            
            const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `toledao_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            this.notificar('📥 Dados exportados com sucesso!', 'success');
        });
    }

    notificar(msg, tipo) {
        const notification = document.getElementById('notification');
        if (!notification) return;
        
        notification.textContent = msg;
        notification.className = `notification ${tipo}`;
        notification.style.display = 'block';

        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }
}

// Inicializar aplicação
const app = new App();
window.app = app;
