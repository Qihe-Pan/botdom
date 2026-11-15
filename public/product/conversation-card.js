/* Keep the sample's animated stage and conversation in one shared card. */
(() => {
  const replay = document.querySelector('#replay');
  const block = replay?.querySelector('.light-transcript-block');
  if (!replay || !block) return;
  replay.classList.add('chat-card');
  const seatFor = name => replay.querySelector(`[data-seat="${name}"] .mu-face, [data-seat="${name}"] .mu-you`);
  replay.querySelectorAll('.mu-transcript li').forEach(row => {
    const face = seatFor(row.dataset.from);
    if (!face) return;
    const avatar = face.cloneNode(true);
    avatar.classList.add('chat-card-avatar');
    avatar.setAttribute('aria-hidden', 'true');
    row.prepend(avatar);
  });
})();
