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
const SONG_STORAGE = 'homeroom.locker-song.v1';
let lockerSong = readLockerSong();
let musicLayer = null;
const musicLayers = [];
let musicSearchController = null;

function readLockerSong() {
  try {
    const saved = JSON.parse(localStorage.getItem(SONG_STORAGE));
    if (!saved || !/^[A-Za-z0-9]{22}$/.test(saved.id) || typeof saved.title !== 'string' || typeof saved.artist !== 'string') return null;
    return { ...saved, url: `https://open.spotify.com/track/${saved.id}`, caption: typeof saved.caption === 'string' ? saved.caption.slice(0, 120) : '', placement: musicPlacement(saved.placement) };
  } catch { return null; }
}

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

function createMusicItem(song, placement = song.placement) {
  return { id: ++uid, kind: 'object', base: MUSIC_OBJECT, ...musicPlacement(placement), title: song.title, desc: song.caption || '' };
}

function writeLockerSong(song) {
  if (song) localStorage.setItem(SONG_STORAGE, JSON.stringify(song));
  else localStorage.removeItem(SONG_STORAGE);
  lockerSong = song;
}

function persistMusicItem(it) {
  if (it.base !== MUSIC_OBJECT || !lockerSong) return;
  try { writeLockerSong({ ...lockerSong, caption: it.desc, placement: musicPlacement(it) }); syncMe(); }
  catch { toast("couldn't save your song's changes; please allow site storage"); }
}

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
  return el('header', { className: 'music-heading' }, [el('div', {}, [el('h2', { textContent: title }), el('p', { textContent: subtitle })]), close]);
}

function songCassette(song, listen) {
  const art = el('span', { className: 'mixtape-art' });
  art.setAttribute('aria-hidden', 'true');
  art.innerHTML = CASSETTE_SVG;
  const button = el('button', { className: 'song-cassette', type: 'button' }, [art,
    el('span', { className: 'song-cassette-title', textContent: song.title }),
    el('span', { className: 'song-cassette-artist', textContent: song.artist }),
    el('span', { className: 'song-cassette-action', textContent: '♫ listen on Spotify' })]);
  button.setAttribute('aria-label', `Listen to ${song.title} by ${song.artist} on Spotify`);
  button.addEventListener('click', listen);
  return button;
}

function openSongPlayer(song) {
  const dialog = openMusicLayer('Your locker soundtrack', true);
  musicLayer.classList.add('music-playback-layer');
  dialog.append(musicHeading('Currently on repeat', `${song.title} · ${song.artist}`, 'Close Spotify player'), spotifyFrame(song));
  if (song.caption) dialog.append(el('p', { className: 'music-player-caption', textContent: song.caption }));
  dialog.querySelector('button').focus();
}

function openMusicEditor(placement) {
  const existing = items?.find(it => it.base === MUSIC_OBJECT);
  let draft = lockerSong ? { ...lockerSong } : null;
  let tracks = [];
  const dialog = openMusicLayer('Edit your locker soundtrack');
  dialog.append(musicHeading('Give your locker a soundtrack', 'A song, a little story, a little more you.'));

  const columns = el('div', { className: 'music-columns' });
  const preview = el('div', { className: 'music-preview' });
  preview.append(el('span', { className: 'music-label', textContent: 'Your locker' }));
  const scene = el('div', { className: 'music-scene' });
  scene.style.backgroundImage = `url('${A.interior_you}')`;
  const player = el('div', { className: 'music-preview-player' });
  scene.append(player);
  const selectedName = el('p', { className: 'music-selected-name' });
  const remove = el('button', { className: 'music-remove', type: 'button', textContent: 'Remove song' });
  remove.addEventListener('click', () => { draft = null; updatePreview(); renderResults(); });
  const captionLabel = el('label', { className: 'music-label music-caption-label', htmlFor: 'songCaption', textContent: 'A little story (optional)' });
  const caption = el('textarea', { className: 'music-caption', id: 'songCaption', maxLength: 120, rows: 2, placeholder: 'My walk-home song after a long day...', value: draft?.caption || '' });
  preview.append(scene, selectedName, remove, captionLabel, caption);

  const search = el('div', { className: 'music-search' });
  const label = el('label', { className: 'music-label', htmlFor: 'songSearch', textContent: 'Find your song' });
  const form = el('form', { className: 'music-search-form' });
  const input = el('input', { id: 'songSearch', className: 'music-search-input', type: 'search', placeholder: 'Song title or artist...', maxLength: 120, autocomplete: 'off', required: true, minLength: 2 });
  const submit = el('button', { className: 'music-button', type: 'submit', textContent: 'Search' });
  form.append(input, submit);
  const hints = el('div', { className: 'music-hints' }, [el('span', { textContent: 'Try' })]);
  ['Laufey From The Start', 'Clairo', 'Stardew Valley'].forEach(query => {
    const hint = el('button', { className: 'music-hint', type: 'button', textContent: query === 'Laufey From The Start' ? 'Laufey' : query });
    hint.addEventListener('click', () => { input.value = query; form.requestSubmit(); });
    hints.append(hint);
  });
  const status = el('p', { className: 'music-search-status', textContent: 'Find something you could listen to on repeat.' });
  status.setAttribute('role', 'status');
  const results = el('div', { className: 'music-results' });
  search.append(label, form, hints, status, results);
  columns.append(preview, search);

  const creditLink = el('a', { href: 'https://glasser.ai/', target: '_blank', rel: 'noopener noreferrer', textContent: 'Glasser' });
  const credit = el('div', { className: 'music-credit' }, ['Song discovery by ', creditLink, el('br'), 'Playback by Spotify']);
  const save = musicButton('Pin song to locker', async () => {
    const song = draft ? { ...draft, caption: caption.value.trim() } : null;
    const it = song ? createMusicItem(song, existing ? musicPlacement(existing) : placement || song.placement) : null;
    if (it) { await bake(it); if (!existing) { clamp(it); snap(it); } song.placement = musicPlacement(it); }
    try {
      writeLockerSong(song);
    } catch {
      status.textContent = "Your browser couldn't save this. Please allow site storage and try again.";
      status.classList.add('error');
      return;
    }
    items = (items || []).filter(item => item.base !== MUSIC_OBJECT);
    if (it) items.push(it);
    sel = it;
    syncMe();
    closeMusicEditor();
    if (ED) renderEditor();
    else openLocker(PEOPLE.find(person => person.you));
    toast(song ? 'your locker has a soundtrack ♫' : 'song removed from your locker');
  }, true);
  const footer = el('footer', { className: 'music-footer' }, [credit, el('div', { className: 'music-footer-actions' }, [musicButton('Cancel', closeMusicEditor), save])]);
  dialog.append(columns, footer);

  function updatePreview() {
    player.replaceChildren();
    if (draft) player.append(songCassette(draft, () => openSongPlayer({ ...draft, caption: caption.value.trim() })));
    else player.append(el('div', { className: 'music-placeholder' }, [el('span', { className: 'cassette', ariaHidden: 'true' }), el('p', { textContent: 'A little space for\nsomething on repeat.' })]));
    selectedName.replaceChildren();
    if (draft) selectedName.append(el('a', { href: draft.url, target: '_blank', rel: 'noopener noreferrer', textContent: `${draft.title} · ${draft.artist} on Spotify ↗` }));
    else selectedName.textContent = 'Choose a song to see it in your locker.';
    remove.hidden = !draft;
    save.disabled = !draft && !lockerSong;
    save.textContent = draft ? 'Pin song to locker' : 'Save locker';
  }

  function renderResults() {
    results.replaceChildren();
    if (!tracks.length) {
      results.append(el('div', { className: 'music-search-empty' }, [el('span', { className: 'cassette', ariaHidden: 'true' }), el('p', { textContent: 'An old favorite. A new obsession.\nWhat sounds like you?' })]));
      return;
    }
    for (const track of tracks) {
      const selected = draft?.id === track.id;
      const art = track.artwork ? el('img', { className: 'music-art', src: track.artwork, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }) : el('span', { className: 'music-art' });
      const row = el('button', { className: 'music-result', type: 'button' }, [art, el('span', { className: 'music-result-copy' }, [el('b', { textContent: track.title }), el('span', { textContent: track.artist })]), el('span', { className: 'music-result-action', textContent: selected ? '✓' : '+' })]);
      row.setAttribute('aria-label', `${selected ? 'Selected' : 'Add'} ${track.title} by ${track.artist}`);
      row.setAttribute('aria-pressed', String(selected));
      row.addEventListener('click', () => { draft = { ...track }; updatePreview(); renderResults(); });
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
    hints.querySelectorAll('button').forEach(button => button.disabled = true);
    submit.textContent = 'Searching...';
    status.classList.remove('error');
    status.textContent = 'Looking through the record shelf...';
    results.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch('/api/spotify/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }), signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't search right now. Please try again.");
      if (controller.signal.aborted) return;
      tracks = data.tracks;
      status.textContent = tracks.length ? `${tracks.length} songs found. Pick one for your locker.` : 'No songs found. Try another title or artist.';
      renderResults();
    } catch (error) {
      if (controller.signal.aborted) return;
      status.textContent = error instanceof Error ? error.message : "Couldn't search right now. Please try again.";
      status.classList.add('error');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Search';
      hints.querySelectorAll('button').forEach(button => button.disabled = false);
      results.removeAttribute('aria-busy');
    }
  });

  updatePreview();
  renderResults();
  input.focus();
}
