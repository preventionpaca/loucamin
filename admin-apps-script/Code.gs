const LC_ADMIN_VERSION = '1.0.0-alpha.1';
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
  return value === true || String(value || '').trim().toLowerCase() === 'true';
}

function LC_contexteAdministrateur_() {
  const email = LC_emailActif_();
  if (!email) throw new Error('Identité Google indisponible. Reconnectez-vous avec un compte autorisé.');
  const filter = encodeURIComponent(JSON.stringify({Email: [email]}));
  const result = LC_grist_('get', '/tables/' + LC_ADMIN_TABLE + '/records?filter=' + filter);
  const matches = (result.records || []).filter(function(record) {
    const fields = record.fields || {};
    return String(fields.Email || '').trim().toLowerCase() === email && LC_bool_(fields.Actif);
  });
  if (matches.length !== 1) throw new Error('Ce compte Google n’est pas autorisé à administrer le site.');
  const fields = matches[0].fields;
  return {
    email: email,
    nom: String(fields.Nom_affichage || email),
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
  return {version: LC_ADMIN_VERSION, administrateur: admin, produits: produits};
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
