const LC_ADMIN_VERSION = '1.4.1';
// Dans Grist, la table affichée « Administrateurs » conserve l'identifiant technique Table1.
const LC_ADMIN_TABLE = 'Table1';
const LC_PRODUCTS_TABLE = 'Produits';
const LC_INITIAL_PRODUCTS = [
  {
    Slug: 'guide-prevention-risques',
    Titre: 'Guide pour la prévention des risques',
    Description: 'Portail et outils destinés à accompagner les établissements dans la prévention des risques professionnels et les démarches liées aux travaux réglementés.',
    Image_URL: 'https://loucodi.fr/assets/projet-prevention-paca.png',
    Ordre: 10
  },
  {
    Slug: 'suivi-appels-telephoniques',
    Titre: 'Plateforme de suivi d’appels téléphoniques',
    Description: 'Centralisation, attribution et suivi des demandes reçues, avec historique des actions et organisation du traitement par l’équipe.',
    Image_URL: 'https://loucodi.fr/assets/projet-suivi-appels-anonymise.jpg',
    Ordre: 20
  },
  {
    Slug: 'gestion-mini-stages',
    Titre: 'Gestion de mini-stages collège–lycée',
    Description: 'Organisation des inscriptions, conventions, capacités d’accueil, affectations et suivi des mini-stages entre collèges et lycée.',
    Image_URL: 'https://loucodi.fr/assets/projet-mini-stages-anonymise.jpg',
    Ordre: 30
  }
];

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Administration — Lou Còdi');
}

function LC_include_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function LC_changerCompteUrl_() {
  const applicationUrl = ScriptApp.getService().getUrl();
  return 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(applicationUrl);
}

function LC_config_() {
  const properties = PropertiesService.getScriptProperties();
  const apiUrl = String(properties.getProperty('LC_GRIST_API_URL') || 'https://docs.getgrist.com').replace(/\/$/, '');
  const docId = String(properties.getProperty('LC_GRIST_DOC_ID') || '').trim();
  const apiKey = String(properties.getProperty('LC_GRIST_API_KEY') || '').trim();
  if (!docId || !apiKey) throw new Error('Configuration Grist incomplète.');
  return {apiUrl: apiUrl, docId: docId, apiKey: apiKey};
}

function LC_grist_(method, path, body) {
  const config = LC_config_();
  const documentUrl = config.apiUrl + '/api/docs/' + encodeURIComponent(config.docId);
  const options = {
    method: method,
    muteHttpExceptions: true,
    headers: {Authorization: 'Bearer ' + config.apiKey, Accept: 'application/json'}
  };
  if (body !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(body);
  }
  const response = UrlFetchApp.fetch(
    documentUrl + path,
    options
  );
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    if (status === 404 && path.indexOf('/tables/') === 0) {
      const probe = UrlFetchApp.fetch(documentUrl + '/tables', {
        method: 'get',
        muteHttpExceptions: true,
        headers: options.headers
      });
      if (probe.getResponseCode() === 200) {
        const tableData = JSON.parse(probe.getContentText() || '{}');
        const tableIds = (tableData.tables || []).map(function(table) { return table.id; });
        throw new Error('Table Grist introuvable. Tables disponibles : ' + (tableIds.join(', ') || 'aucune') + '.');
      }
      throw new Error('Le document Grist est introuvable ou le jeton utilisé n’y a pas accès (404).');
    }
    throw new Error('Grist indisponible ou requête refusée (' + status + ').');
  }
  return JSON.parse(response.getContentText() || '{}');
}

function LC_emailActif_() {
  return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
}

function LC_bool_(value) {
  if (value === true || value === 1) return true;
  return ['true', '1', 'yes', 'oui', 'x'].indexOf(
    String(value == null ? '' : value).trim().toLowerCase()
  ) !== -1;
}

function LC_emailAdministrateur_(fields) {
  const preferred = [fields.Email, fields.A];
  for (let index = 0; index < preferred.length; index += 1) {
    const value = String(preferred[index] == null ? '' : preferred[index]).trim().toLowerCase();
    if (value && value.indexOf('@') !== -1) return value;
  }
  // Compatibilité avec une table créée manuellement : le libellé visible et
  // l'identifiant technique de la colonne peuvent être différents dans Grist.
  const values = Object.keys(fields).map(function(key) { return fields[key]; });
  for (let index = 0; index < values.length; index += 1) {
    const value = String(values[index] == null ? '' : values[index]).trim().toLowerCase();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return value;
  }
  return '';
}

function LC_contexteAdministrateur_() {
  const email = LC_emailActif_();
  if (!email) throw new Error('Identité Google indisponible. Reconnectez-vous avec un compte autorisé.');
  // Les premières lignes du document ont été saisies avant la création des
  // colonnes nommées : l'adresse et le nom se trouvent alors dans A et B.
  // Lire la petite table complète permet de migrer progressivement ces lignes
  // sans bloquer le compte qui doit justement ouvrir l'administration.
  const result = LC_grist_('get', '/tables/' + LC_ADMIN_TABLE + '/records');
  const matches = (result.records || []).filter(function(record) {
    const fields = record.fields || {};
    return LC_emailAdministrateur_(fields) === email && LC_bool_(fields.Actif);
  });
  if (matches.length !== 1) {
    const accountRecord = (result.records || []).find(function(record) {
      return LC_emailAdministrateur_(record.fields || {}) === email;
    });
    throw new Error(
      accountRecord
        ? 'Le compte Google ' + email + ' est présent dans Grist, mais sa colonne Actif n’est pas cochée.'
        : 'Le compte Google détecté (' + email + ') n’existe dans aucune ligne de la table Administrateurs.'
    );
  }
  const fields = matches[0].fields;
  const displayName = String(fields.Nom_affichage || '').trim() || String(fields.B || '').trim();
  return {
    email: email,
    nom: displayName || email,
    role: String(fields.Role || 'EDITEUR'),
    peutModifier: LC_bool_(fields.Peut_modifier_produits) || String(fields.Role || '').toUpperCase() === 'ADMIN'
  };
}

function LC_nettoyer_(value, limit) {
  return String(value == null ? '' : value).replace(/\u0000/g, '').trim().slice(0, limit);
}

function LC_url_(value) {
  const url = LC_nettoyer_(value, 1000);
  if (url && !/^https:\/\//i.test(url)) throw new Error('Les liens doivent commencer par https://.');
  return url;
}

function LC_vueProduit_(record) {
  const fields = record.fields || {};
  return {
    id: Number(record.id),
    slug: String(fields.Slug || ''),
    titre: String(fields.Titre || ''),
    description: String(fields.Description || ''),
    imageUrl: String(fields.Image_URL || ''),
    lienPrincipal: String(fields.Lien_Principal || ''),
    libellePrincipal: String(fields.Libelle_Principal || ''),
    lienTelechargement: String(fields.Lien_Telechargement || ''),
    confidentialiteUrl: String(fields.Confidentialite_URL || ''),
    conditionsUrl: String(fields.Conditions_URL || ''),
    ordre: Number(fields.Ordre || 0),
    visible: LC_bool_(fields.Visible),
    modifieLe: fields.Modifie_le || ''
  };
}

function LC_ajouterProduitsInitiaux_(admin, records) {
  if (!admin.peutModifier) return;
  const slugs = new Set((records || []).map(function(record) {
    return String((record.fields || {}).Slug || '').trim().toLowerCase();
  }));
  const now = new Date().toISOString();
  const missing = LC_INITIAL_PRODUCTS.filter(function(product) {
    return !slugs.has(product.Slug);
  }).map(function(product) {
    return {fields: Object.assign({
      Lien_Principal: '',
      Libelle_Principal: '',
      Lien_Telechargement: '',
      Confidentialite_URL: '',
      Conditions_URL: '',
      Visible: true,
      Cree_le: now,
      Modifie_le: now,
      Modifie_par: admin.email
    }, product)};
  });
  if (missing.length) LC_grist_('post', '/tables/' + LC_PRODUCTS_TABLE + '/records', {records: missing});
}

function chargerAdministration() {
  const admin = LC_contexteAdministrateur_();
  let result = LC_grist_('get', '/tables/' + LC_PRODUCTS_TABLE + '/records');
  LC_ajouterProduitsInitiaux_(admin, result.records || []);
  if (LC_INITIAL_PRODUCTS.some(function(product) {
    return !(result.records || []).some(function(record) {
      return String((record.fields || {}).Slug || '').trim().toLowerCase() === product.Slug;
    });
  })) result = LC_grist_('get', '/tables/' + LC_PRODUCTS_TABLE + '/records');
  const produits = (result.records || []).map(LC_vueProduit_).sort(function(a, b) {
    return a.ordre - b.ordre || a.titre.localeCompare(b.titre, 'fr');
  });
  return {
    version: LC_ADMIN_VERSION,
    administrateur: admin,
    produits: produits,
    publicationAccueilConfiguree: Boolean(String(PropertiesService.getScriptProperties().getProperty('LC_GITHUB_TOKEN') || '').trim()),
    publicationPagesConfiguree: Boolean(String(PropertiesService.getScriptProperties().getProperty('LC_GITHUB_TOKEN') || '').trim())
  };
}

function LC_github_(method, path, body) {
  const properties = PropertiesService.getScriptProperties();
  const token = String(properties.getProperty('LC_GITHUB_TOKEN') || '').trim();
  if (!token) throw new Error('La publication GitHub n’est pas encore configurée dans cette administration.');
  const repository = String(properties.getProperty('LC_GITHUB_REPOSITORY') || 'preventionpaca/loucamin').trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Le dépôt GitHub configuré est invalide.');
  const options = {
    method: method,
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  };
  if (body !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(body);
  }
  const response = UrlFetchApp.fetch('https://api.github.com/repos/' + repository + path, options);
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error('Publication GitHub refusée (' + status + '). Vérifiez la liaison sécurisée.');
  return JSON.parse(response.getContentText() || '{}');
}

function LC_nombreReglage_(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}

function publierReglageAccueil(payload) {
  const admin = LC_contexteAdministrateur_();
  if (!admin.peutModifier) throw new Error('Ce compte dispose uniquement d’un accès en lecture.');
  const themes = ['jour','nuit','pins','rivage','coquelicots','etoiles','vignoble','village','chateau','vaches'];
  const payloads = Array.isArray(payload) ? payload : [payload || {}];
  if (!payloads.length || payloads.length > themes.length) throw new Error('Le nombre de fonds à publier est invalide.');
  const limits = {
    '--brand-x':[-900,900,0],'--brand-y':[-700,700,0],'--brand-w':[280,1000,610],'--brand-h':[80,500,126],
    '--intro-x':[-900,900,0],'--intro-y':[-700,700,0],'--intro-w':[320,1500,960],'--intro-h':[80,700,180],
    '--cards-x':[-900,900,0],'--cards-y':[-700,700,0],'--cards-w':[660,1500,960],'--cards-h':[135,700,148],
    '--bg-zoom':[1,1.45,1],'--bg-x':[0,100,50],'--bg-y':[0,100,50],'--bg-sat':[.7,1.7,1],
    '--bg-contrast':[.7,1.5,1],'--bg-bright':[.6,1.25,1],'--sky-blue':[0,.45,0]
  };
  const filePath = '/contents/assets/accueil-layouts.json';
  const current = LC_github_('get', filePath + '?ref=main');
  const decoded = Utilities.newBlob(Utilities.base64Decode(String(current.content || '').replace(/\s/g,''))).getDataAsString('UTF-8');
  let layouts = {};
  try { layouts = JSON.parse(decoded || '{}'); } catch (error) { layouts = {}; }
  const publishedThemes = [];
  payloads.forEach(function(item) {
    item = item || {};
    const theme = LC_nettoyer_(item.fond, 30);
    if (themes.indexOf(theme) === -1) throw new Error('Le fond indiqué est inconnu.');
    const source = item.reglages || {};
    const clean = {};
    Object.keys(limits).forEach(function(name) {
      const limit = limits[name];
      clean[name] = LC_nombreReglage_(source[name], limit[0], limit[1], limit[2]);
    });
    layouts[theme] = clean;
    if (publishedThemes.indexOf(theme) === -1) publishedThemes.push(theme);
  });
  const content = Utilities.base64Encode(Utilities.newBlob(JSON.stringify(layouts, null, 2) + '\n','application/json').getBytes());
  const updated = LC_github_('put', filePath, {
    message: 'Met à jour la mise en page de l’accueil',
    content: content,
    sha: current.sha,
    branch: 'main'
  });
  return {fonds: publishedThemes, nombre: publishedThemes.length, commit: updated.commit && updated.commit.sha ? String(updated.commit.sha) : ''};
}

function LC_slugPage_(value) {
  const slug = LC_nettoyer_(value, 80).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) throw new Error('L’identifiant de page est invalide.');
  return slug;
}

function LC_urlMedia_(value) {
  const url = LC_nettoyer_(value, 1000);
  if (!url) return '';
  if (/^https:\/\//i.test(url)) return url;
  if (/^assets\/[A-Za-z0-9_./-]+$/.test(url) && url.indexOf('..') === -1) return url;
  throw new Error('Une image doit utiliser une adresse https:// ou un chemin assets/ du site.');
}

function LC_nettoyerBlocPage_(block, index) {
  block = block || {};
  const type = LC_nettoyer_(block.type, 20).toLowerCase();
  const width = ['full','half','third'].indexOf(block.width) === -1 ? 'full' : block.width;
  const base = {id: 'bloc-' + (index + 1), type: type, width: width};
  if (type === 'text') {
    base.title = LC_nettoyer_(block.title, 180);
    base.content = LC_nettoyer_(block.content, 12000);
    if (!base.title && !base.content) throw new Error('Le bloc texte ' + (index + 1) + ' est vide.');
    return base;
  }
  if (type === 'card') {
    base.title = LC_nettoyer_(block.title, 180);
    base.content = LC_nettoyer_(block.content, 8000);
    base.icon = LC_urlMedia_(block.icon);
    base.open = block.open === true;
    if (!base.title) throw new Error('Le titre de la vignette ' + (index + 1) + ' est obligatoire.');
    return base;
  }
  if (type === 'image') {
    base.src = LC_urlMedia_(block.src);
    base.alt = LC_nettoyer_(block.alt, 300);
    base.caption = LC_nettoyer_(block.caption, 500);
    if (!base.src) throw new Error('L’image du bloc ' + (index + 1) + ' est obligatoire.');
    return base;
  }
  throw new Error('Le type du bloc ' + (index + 1) + ' est inconnu.');
}

function LC_lireFichierGithub_(path) {
  try {
    const file = LC_github_('get', '/contents/' + path + '?ref=main');
    const decoded = Utilities.newBlob(Utilities.base64Decode(String(file.content || '').replace(/\s/g,''))).getDataAsString('UTF-8');
    return {sha: String(file.sha || ''), text: decoded};
  } catch (error) {
    return null;
  }
}

function LC_ecrireFichierGithub_(path, value, message, sha) {
  const body = {
    message: message,
    content: Utilities.base64Encode(Utilities.newBlob(value, 'application/json').getBytes()),
    branch: 'main'
  };
  if (sha) body.sha = sha;
  return LC_github_('put', '/contents/' + path, body);
}

function chargerPagesSite() {
  const admin = LC_contexteAdministrateur_();
  if (!admin.peutModifier) return [];
  const current = LC_lireFichierGithub_('assets/pages/index.json');
  if (!current) return [];
  try {
    const parsed = JSON.parse(current.text || '{}');
    return Array.isArray(parsed.pages) ? parsed.pages.map(function(page) {
      return {slug: LC_slugPage_(page.slug), title: LC_nettoyer_(page.title, 180), updatedAt: LC_nettoyer_(page.updatedAt, 50), published: page.published !== false};
    }) : [];
  } catch (error) {
    throw new Error('L’index des pages du site est invalide.');
  }
}

function chargerContenuPageSite(slug) {
  const admin = LC_contexteAdministrateur_();
  if (!admin.peutModifier) throw new Error('Ce compte dispose uniquement d’un accès en lecture.');
  const cleanSlug = LC_slugPage_(slug);
  const current = LC_lireFichierGithub_('assets/pages/' + cleanSlug + '.json');
  if (!current) throw new Error('Cette page est introuvable.');
  try { return JSON.parse(current.text || '{}'); }
  catch (error) { throw new Error('Le contenu de cette page est invalide.'); }
}

function publierPageSite(payload) {
  const admin = LC_contexteAdministrateur_();
  if (!admin.peutModifier) throw new Error('Ce compte dispose uniquement d’un accès en lecture.');
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); }
    catch (error) { throw new Error('Les données de la page sont illisibles. Rechargez l’administration puis réessayez.'); }
  }
  payload = payload && typeof payload === 'object' ? payload : {};
  const slug = LC_slugPage_(payload.slug);
  const title = LC_nettoyer_(payload.title, 180);
  if (!title) throw new Error('Le titre de la page est obligatoire.');
  const inputBlocks = Array.isArray(payload.blocks) ? payload.blocks : [];
  if (inputBlocks.length > 60) throw new Error('Une page ne peut pas dépasser 60 blocs.');
  const now = new Date().toISOString();
  const page = {
    schemaVersion: 1,
    slug: slug,
    title: title,
    introduction: LC_nettoyer_(payload.introduction, 3000),
    published: payload.published !== false,
    updatedAt: now,
    blocks: inputBlocks.map(LC_nettoyerBlocPage_)
  };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Une autre publication est en cours. Réessayez.');
  try {
    const pagePath = 'assets/pages/' + slug + '.json';
    const currentPage = LC_lireFichierGithub_(pagePath);
    const writtenPage = LC_ecrireFichierGithub_(pagePath, JSON.stringify(page, null, 2) + '\n', 'Publie la page « ' + title + ' »', currentPage && currentPage.sha);
    const currentIndex = LC_lireFichierGithub_('assets/pages/index.json');
    let index = {pages: []};
    if (currentIndex) {
      try { index = JSON.parse(currentIndex.text || '{}'); } catch (error) { index = {pages: []}; }
    }
    if (!Array.isArray(index.pages)) index.pages = [];
    const entry = {slug: slug, title: title, updatedAt: now, published: page.published};
    const existing = index.pages.findIndex(function(item) { return item && item.slug === slug; });
    if (existing === -1) index.pages.push(entry); else index.pages[existing] = entry;
    index.pages.sort(function(a, b) { return String(a.title || '').localeCompare(String(b.title || ''), 'fr'); });
    LC_ecrireFichierGithub_('assets/pages/index.json', JSON.stringify(index, null, 2) + '\n', 'Met à jour l’index des pages', currentIndex && currentIndex.sha);
    return {
      slug: slug,
      url: 'https://loucodi.fr/page.html?page=' + encodeURIComponent(slug),
      commit: writtenPage.commit && writtenPage.commit.sha ? String(writtenPage.commit.sha) : ''
    };
  } finally {
    lock.releaseLock();
  }
}

function LC_indexPages_() {
  const current = LC_lireFichierGithub_('assets/pages/index.json');
  let index = {pages: []};
  if (current) {
    try { index = JSON.parse(current.text || '{}'); } catch (error) { throw new Error('L’index des pages du site est invalide.'); }
  }
  if (!Array.isArray(index.pages)) index.pages = [];
  return {current: current, value: index};
}

function changerPublicationPageSite(slug, published) {
  const admin = LC_contexteAdministrateur_();
  if (!admin.peutModifier) throw new Error('Ce compte dispose uniquement d’un accès en lecture.');
  const cleanSlug = LC_slugPage_(slug);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Une autre publication est en cours. Réessayez.');
  try {
    const pagePath = 'assets/pages/' + cleanSlug + '.json';
    const currentPage = LC_lireFichierGithub_(pagePath);
    if (!currentPage) throw new Error('Cette page est introuvable.');
    let page;
    try { page = JSON.parse(currentPage.text || '{}'); } catch (error) { throw new Error('Le contenu de cette page est invalide.'); }
    page.published = published === true;
    page.updatedAt = new Date().toISOString();
    LC_ecrireFichierGithub_(pagePath, JSON.stringify(page, null, 2) + '\n', page.published ? 'Publie la page « ' + page.title + ' »' : 'Dépublie la page « ' + page.title + ' »', currentPage.sha);
    const indexed = LC_indexPages_();
    const entry = indexed.value.pages.find(function(item) { return item && item.slug === cleanSlug; });
    if (entry) { entry.published = page.published; entry.updatedAt = page.updatedAt; }
    LC_ecrireFichierGithub_('assets/pages/index.json', JSON.stringify(indexed.value, null, 2) + '\n', 'Met à jour la visibilité de la page « ' + page.title + ' »', indexed.current && indexed.current.sha);
    return {slug: cleanSlug, published: page.published};
  } finally { lock.releaseLock(); }
}

function supprimerPageSite(slug) {
  const admin = LC_contexteAdministrateur_();
  if (!admin.peutModifier) throw new Error('Ce compte dispose uniquement d’un accès en lecture.');
  const cleanSlug = LC_slugPage_(slug);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Une autre publication est en cours. Réessayez.');
  try {
    const pagePath = 'assets/pages/' + cleanSlug + '.json';
    const currentPage = LC_lireFichierGithub_(pagePath);
    if (!currentPage) throw new Error('Cette page est introuvable.');
    LC_github_('delete', '/contents/' + pagePath, {message: 'Supprime la page « ' + cleanSlug + ' »', sha: currentPage.sha, branch: 'main'});
    const indexed = LC_indexPages_();
    indexed.value.pages = indexed.value.pages.filter(function(item) { return !item || item.slug !== cleanSlug; });
    LC_ecrireFichierGithub_('assets/pages/index.json', JSON.stringify(indexed.value, null, 2) + '\n', 'Retire la page « ' + cleanSlug + ' » de l’index', indexed.current && indexed.current.sha);
    return {slug: cleanSlug};
  } finally { lock.releaseLock(); }
}

function publierMediaPageSite(payload) {
  const admin = LC_contexteAdministrateur_();
  if (!admin.peutModifier) throw new Error('Ce compte dispose uniquement d’un accès en lecture.');
  payload = payload || {};
  const types = {'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'};
  const mime = LC_nettoyer_(payload.mime, 80).toLowerCase();
  if (!types[mime]) throw new Error('Format refusé. Utilisez PNG, JPEG, WebP ou GIF.');
  const encoded = String(payload.data || '').replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  if (!encoded || encoded.length > 5600000) throw new Error('L’image est vide ou dépasse la limite de 4 Mo.');
  let bytes;
  try { bytes = Utilities.base64Decode(encoded); } catch (error) { throw new Error('Le fichier image est illisible.'); }
  if (bytes.length > 4 * 1024 * 1024) throw new Error('L’image dépasse la limite de 4 Mo.');
  const baseName = LC_nettoyer_(payload.name, 120).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
  const unique = Utilities.formatDate(new Date(), 'UTC', 'yyyyMMdd-HHmmss') + '-' + Utilities.getUuid().slice(0, 8) + '-' + baseName.slice(0, 60) + '.' + types[mime];
  const path = 'assets/pages/media/' + unique;
  LC_github_('put', '/contents/' + path, {message: 'Ajoute une image pour les pages du site', content: Utilities.base64Encode(bytes), branch: 'main'});
  return {path: path, url: 'https://loucodi.fr/' + path};
}

function enregistrerProduit(payload) {
  const admin = LC_contexteAdministrateur_();
  if (!admin.peutModifier) throw new Error('Ce compte dispose uniquement d’un accès en lecture.');
  payload = payload || {};
  const id = Number(payload.id || 0);
  const slug = LC_nettoyer_(payload.slug, 120).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const titre = LC_nettoyer_(payload.titre, 180);
  if (!slug || !titre) throw new Error('Le titre et l’identifiant du produit sont obligatoires.');
  const now = new Date().toISOString();
  const fields = {
    Slug: slug,
    Titre: titre,
    Description: LC_nettoyer_(payload.description, 3000),
    Image_URL: LC_url_(payload.imageUrl),
    Lien_Principal: LC_url_(payload.lienPrincipal),
    Libelle_Principal: LC_nettoyer_(payload.libellePrincipal, 80),
    Lien_Telechargement: LC_url_(payload.lienTelechargement),
    Confidentialite_URL: LC_url_(payload.confidentialiteUrl),
    Conditions_URL: LC_url_(payload.conditionsUrl),
    Ordre: Math.max(0, Math.min(9999, Number(payload.ordre) || 0)),
    Visible: payload.visible === true,
    Modifie_le: now,
    Modifie_par: admin.email
  };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Une autre modification est en cours. Réessayez.');
  try {
    if (id > 0) {
      LC_grist_('patch', '/tables/' + LC_PRODUCTS_TABLE + '/records', {records: [{id: id, fields: fields}]});
      return {operation: 'modification', id: id};
    }
    fields.Cree_le = now;
    const created = LC_grist_('post', '/tables/' + LC_PRODUCTS_TABLE + '/records', {records: [{fields: fields}]});
    return {operation: 'creation', id: created.records && created.records[0] && created.records[0].id};
  } finally {
    lock.releaseLock();
  }
}
