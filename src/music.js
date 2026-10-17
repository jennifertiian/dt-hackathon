const MUSIC_OBJECT = 'music_cassette';
const CASSETTE_SVG = `<svg viewBox="0 0 88 56" width="28" height="18" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
  <path fill="#786787" d="M6 5h76v3h4v44h-4v4H6v-4H2V8h4z"/>
  <path fill="#504456" d="M4 0h76v4h4v44h-4v4H4v-4H0V4h4z"/>
  <path fill="#b9abc9" d="M4 4h76v44H4z"/>
  <path fill="#dfd1e3" d="M4 4h76v4H8v36H4z"/>
  <path fill="#9583ab" d="M76 8h4v40H8v-4h68z"/>
  <path fill="#504456" d="M10 10h64v27H10z"/>
  <path fill="#fff3dc" d="M12 12h60v9H12z"/>
  <path fill="#d99caa" d="M12 21h60v3H12z"/>
  <path fill="#756482" d="M12 24h60v11H12z"/>
  <path fill="#d9c9d9" d="M17 24h12v2h2v6h-2v3H17v-3h-2v-6h2zm38 0h12v2h2v6h-2v3H55v-3h-2v-6h2z"/>
  <path fill="#504456" d="M21 27h4v5h-4zm38 0h4v5h-4zm-24 0h14v5H35z"/>
  <path fill="#a9cd72" d="M37 28h10v3H37z"/>
  <path fill="#504456" d="M27 39h30v3h3v6H24v-6h3z"/>
  <path fill="#d9c9d9" d="M29 41h26v3h3v4H26v-4h3z"/>
  <path fill="#504456" d="M8 41h3v3H8zm63 0h3v3h-3z"/>
</svg>`;
A[MUSIC_OBJECT] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(CASSETTE_SVG);
SIZES[MUSIC_OBJECT] = [28, 18];
let musicLayer = null;
const musicLayers = [];
let musicSearchController = null;

function musicPlacement(value = {}) {
  return {
    cx: Number.isFinite(value?.cx) ? Math.max(11, Math.min(178, value.cx)) : 95,
    cy: Number.isFinite(value?.cy) ? Math.max(11, Math.min(154, value.cy)) : 141,
    scale: value?.scale === 2 ? 2 : 1,
    rot: Number.isFinite(value?.rot) ? value.rot % 360 : 0,
    flip: value?.flip === true,
  };
}

function isMusicAsset(key) { return key === MUSIC_OBJECT || bakedFrom[key]?.base === MUSIC_OBJECT; }

function createMusicItem(song, placement) {
  return { id: ++uid, kind: 'object', base: MUSIC_OBJECT, ...musicPlacement(placement),
    title: song.title.slice(0, 24), desc: song.caption || '', song: { id: song.id, title: song.title, artist: song.artist } };
}

function songForItem(it) { return it?.song ? { ...it.song, caption: it.desc || '' } : null; }

function spotifyFrame(song) {
  const frame = el('iframe', { className: 'spotify-frame', title: `${song.title} by ${song.artist} on Spotify`, src: `https://open.spotify.com/embed/track/${song.id}?theme=0`, width: '100%', height: '152' });
  frame.setAttribute('allow', 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture');
  frame.setAttribute('allowfullscreen', '');
  return frame;
}

function musicButton(text, action, primary = false) {
  const button = el('button', { className: 'music-button' + (primary ? ' primary' : ''), type: 'button', textContent: text });
  button.addEventListener('click', action);
  return button;
}

function openMusicLayer(label, compact = false) {
  if (musicLayer) musicLayer.inert = true;
  const returnFocus = document.activeElement;
  const overlay = el('div', { className: 'music-overlay' });
  const dialog = el('section', { className: 'music-window' + (compact ? ' music-player-window' : ''), tabIndex: -1 });
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', label);
  overlay.append(dialog);
  overlay.addEventListener('click', event => { if (event.target === overlay) closeMusicEditor(); });
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMusicEditor(); }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not(:disabled), input, textarea, a, iframe')].filter(node => !node.hidden);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  musicLayer = overlay;
  musicLayers.push({ layer: overlay, returnFocus });
  $('#stage').inert = true;
  document.body.append(overlay);
  return dialog;
}

function closeMusicEditor() {
  const entry = musicLayers.pop();
  if (!entry) return;
  if (!entry.layer.classList.contains('music-playback-layer')) {
    musicSearchController?.abort();
    musicSearchController = null;
  }
  entry.layer.remove();
  musicLayer = musicLayers.at(-1)?.layer || null;
  if (musicLayer) musicLayer.inert = false;
  $('#stage').inert = Boolean(musicLayer);
  if (entry.returnFocus?.isConnected) entry.returnFocus.focus({ preventScroll: true });
}

function musicHeading(title, subtitle, closeLabel = 'Close music editor') {
  const close = el('button', { className: 'music-close', type: 'button' });
  close.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false" shape-rendering="crispEdges"><path fill="currentColor" d="M1 1h2v2H1z M3 3h2v2H3z M5 5h2v2H5z M7 7h2v2H7z M9 9h2v2H9z M9 1h2v2H9z M7 3h2v2H7z M3 7h2v2H3z M1 9h2v2H1z"/></svg>';
  close.setAttribute('aria-label', closeLabel);
  close.addEventListener('click', closeMusicEditor);
  const copy = el('div', {}, [el('h2', { textContent: title })]);
  if (subtitle) copy.append(el('p', { textContent: subtitle }));
  return el('header', { className: 'music-heading' }, [copy, close]);
}

function openSongPlayer(song, owner) {
  const dialog = openMusicLayer(owner ? `${owner}'s locker soundtrack` : 'Your locker soundtrack', true);
  musicLayer.classList.add('music-playback-layer');
  dialog.append(musicHeading('Currently on repeat', `${song.title} · ${song.artist}`, 'Close Spotify player'), spotifyFrame(song));
  if (song.caption) dialog.append(el('p', { className: 'music-player-caption', textContent: song.caption }));
  dialog.querySelector('button').focus();
}

function openMusicEditor(placement) {
  const existing = items?.find(it => it.base === MUSIC_OBJECT);
  let draft = songForItem(existing);
  let tracks = [];
  const dialog = openMusicLayer('Select a song');
  dialog.append(musicHeading('Select a song'));

  const search = el('div', { className: 'music-search' });
  const label = el('label', { className: 'music-label', htmlFor: 'songSearch', textContent: 'Find your song' });
  const form = el('form', { className: 'music-search-form' });
  const input = el('input', { id: 'songSearch', className: 'music-search-input', type: 'search', placeholder: 'Song title or artist...', maxLength: 120, autocomplete: 'off', required: true, minLength: 2 });
  const submit = el('button', { className: 'music-button', type: 'submit', textContent: 'Search' });
  form.append(input, submit);
  const status = el('p', { className: 'music-search-status', textContent: draft ? 'Search to choose a different song.' : 'Search for a song or artist.' });
  status.setAttribute('role', 'status');
  const results = el('div', { className: 'music-results' });
  search.append(label, form, status, results);
  const selection = el('div', { className: 'music-selection' });
  const captionLabel = el('label', { className: 'music-label music-caption-label', htmlFor: 'songCaption', textContent: 'A little story (optional)' });
  const caption = el('textarea', { className: 'music-caption', id: 'songCaption', maxLength: 120, rows: 2, placeholder: 'What does this song mean to you?', value: draft?.caption || '' });

  const creditLink = el('a', { href: 'https://glasser.ai/', target: '_blank', rel: 'noopener noreferrer', textContent: 'Glasser' });
  const credit = el('div', { className: 'music-credit' }, ['Search by ', creditLink]);
  const save = musicButton(existing ? 'Save song' : 'Add song', async () => {
    if (!draft || save.disabled) return;
    save.disabled = true;
    const song = { ...draft, caption: caption.value.trim() };
    const it = createMusicItem(song, existing ? musicPlacement(existing) : placement);
    if (existing) { it.id = existing.id; it.persistedID = existing.persistedID; }
    try { await bake(it); } catch { save.disabled = false; status.textContent = 'Could not prepare the cassette. Please try again.'; return; }
    if (!dialog.isConnected) return;
    if (!existing) { clamp(it); snap(it); }
    items = (items || []).filter(item => item.base !== MUSIC_OBJECT);
    items.push(it);
    sel = it;
    syncMe();
    closeMusicEditor();
    if (ED) renderEditor();
    else openLocker(PEOPLE.find(person => person.you));
    toast('song ready · save your locker to keep it ♫');
  }, true);
  const footer = el('footer', { className: 'music-footer' }, [credit, el('div', { className: 'music-footer-actions' }, [musicButton('Cancel', closeMusicEditor), save])]);
  dialog.append(search, selection, captionLabel, caption, footer);

  function updateSelection() {
    selection.replaceChildren();
    selection.hidden = !draft;
    if (draft) selection.append(el('span', { className: 'music-label', textContent: 'Selected song' }), el('b', { textContent: draft.title }), el('span', { textContent: draft.artist }));
    save.disabled = !draft;
  }

  function renderResults() {
    results.replaceChildren();
    results.hidden = !tracks.length;
    for (const track of tracks) {
      const selected = draft?.id === track.id;
      const art = track.artwork ? el('img', { className: 'music-art', src: track.artwork, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }) : el('span', { className: 'music-art' });
      const row = el('button', { className: 'music-result', type: 'button' }, [art, el('span', { className: 'music-result-copy' }, [el('b', { textContent: track.title }), el('span', { textContent: track.artist })]), el('span', { className: 'music-result-action', textContent: selected ? '✓' : '+' })]);
      row.setAttribute('aria-label', `${selected ? 'Selected' : 'Select'} ${track.title} by ${track.artist}`);
      row.setAttribute('aria-pressed', String(selected));
      row.addEventListener('click', () => { draft = { ...track }; updateSelection(); renderResults(); });
      results.append(row);
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const query = input.value.trim();
    if (query.length < 2 || submit.disabled) return;
    musicSearchController?.abort();
    const controller = new AbortController();
    musicSearchController = controller;
    submit.disabled = true;
    submit.textContent = 'Searching...';
    status.classList.remove('error');
    status.textContent = 'Searching Spotify...';
    results.setAttribute('aria-busy', 'true');
    try {
      if (!useBackend) throw new Error('Song search is available when you sign in to the online app.');
      const data = await appModel.searchSpotify(query, controller.signal);
      if (controller.signal.aborted) return;
      tracks = data.tracks;
      status.textContent = tracks.length ? `${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'} found. Select one below.` : 'No songs found. Try another title or artist.';
      renderResults();
    } catch (error) {
      if (controller.signal.aborted) return;
      status.textContent = error instanceof Error ? error.message : "Couldn't search right now. Please try again.";
      status.classList.add('error');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Search';
      results.removeAttribute('aria-busy');
    }
  });

  updateSelection();
  renderResults();
  input.focus();
}
