const API = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/w342";
const IMG_BIG = "https://image.tmdb.org/t/p/w500";
const LANG = "hu-HU";
const SPEED = 55; // px / másodperc a futósáv sebessége

const $ = (id) => document.getElementById(id);

/* ---------- API segédfüggvény ---------- */
async function tmdb(path, params = {}) {
  const url = new URL(API + path);
  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("language", LANG);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url);
  if (!res.ok) throw new Error("API hiba: " + res.status);
  return res.json();
}

/* Több oldal lekérése és összefűzése (egy oldal 20 film) */
async function fetchPages(path, params, pages) {
  const all = await Promise.all(
    pages.map((p) => tmdb(path, { ...params, page: p }))
  );
  return all.flatMap((r) => r.results);
}

function randomPage(max) {
  return Math.floor(Math.random() * max) + 1;
}

/* ---------- Kártya építése ---------- */
function makeCard(movie) {
  const card = document.createElement("div");
  card.className = "card";
  card.title = movie.title;

  const img = document.createElement("img");
  img.src = IMG + movie.poster_path;
  img.alt = movie.title;
  img.draggable = false;

  const rating = document.createElement("span");
  rating.className = "rating";
  rating.textContent = movie.vote_average ? movie.vote_average.toFixed(1) : "–";

  card.append(img, rating);
  card.addEventListener("click", () => openModal(movie.id));
  return card;
}

/* ---------- Futósáv feltöltése ---------- */
function fillRow(rowId, movies) {
  const track = $(rowId);
  const withPoster = movies.filter((m) => m.poster_path);

  // duplikáljuk a listát, hogy a végtelen ismétlés zökkenőmentes legyen
  [...withPoster, ...withPoster].forEach((m) => track.appendChild(makeCard(m)));

  // sebesség a sáv hosszából
  const half = track.scrollWidth / 2;
  track.style.animationDuration = Math.max(half / SPEED, 20) + "s";
}

/* ---------- Kategóriák betöltése ---------- */
async function loadCategories() {
  try {
    const [trending, classic, recommended] = await Promise.all([
      // Felkapott: e heti trend
      fetchPages("/trending/movie/week", {}, [1, 2]),

      // Klasszikusok: minden idők legnagyobb bevételű filmjei
      fetchPages(
        "/discover/movie",
        { sort_by: "revenue.desc", "vote_count.gte": 1000 },
        [1, 2]
      ),

      // Ajánlott: bármi, ami népszerű és jól értékelt (minden betöltésnél más)
      fetchPages(
        "/discover/movie",
        {
          sort_by: "popularity.desc",
          "vote_count.gte": 500,
          "vote_average.gte": 6.5,
        },
        [randomPage(25), randomPage(25)]
      ),
    ]);

    fillRow("row-trending", trending);
    fillRow("row-classic", classic);
    fillRow("row-recommended", recommended);
  } catch (err) {
    showError(
      "Nem sikerült betölteni a filmeket. Ellenőrizd az API kulcsot a config.js fájlban."
    );
    console.error(err);
  }
}

function showError(msg) {
  const el = $("error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

/* ---------- Keresés ---------- */
let searchTimer;

$("searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  runSearch($("searchInput").value.trim());
});

$("searchInput").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  searchTimer = setTimeout(() => runSearch(q), 400); // várunk, amíg abbahagyja a gépelést
});

async function runSearch(query) {
  const results = $("results");
  const categories = $("categories");

  if (!query) {
    results.classList.add("hidden");
    categories.classList.remove("hidden");
    return;
  }

  try {
    const data = await tmdb("/search/movie", { query, include_adult: "false" });
    const movies = data.results.filter((m) => m.poster_path);

    $("resultsTitle").textContent = movies.length
      ? `Találatok: „${query}”`
      : `Nincs találat erre: „${query}”`;

    const grid = $("resultsGrid");
    grid.innerHTML = "";
    movies.forEach((m) => grid.appendChild(makeCard(m)));

    categories.classList.add("hidden");
    results.classList.remove("hidden");
  } catch (err) {
    showError("A keresés nem sikerült. Próbáld újra.");
    console.error(err);
  }
}

/* ---------- Részletek ablak ---------- */
async function openModal(id) {
  const modal = $("modal");
  const box = $("modalContent");
  box.innerHTML = "<p>Betöltés...</p>";
  modal.classList.remove("hidden");

  try {
    const m = await tmdb("/movie/" + id, { append_to_response: "credits" });
    const year = m.release_date ? m.release_date.slice(0, 4) : "ismeretlen év";
    const genres = m.genres.map((g) => g.name).join(", ");
    const runtime = m.runtime ? ` • ${m.runtime} perc` : "";
    const poster = m.poster_path ? `<img src="${IMG_BIG + m.poster_path}" alt="">` : "";

    box.innerHTML = `
      <div class="detail">
        ${poster}
        <div>
          <h3></h3>
          <div class="meta">${year}${runtime}${genres ? " • " + genres : ""}</div>
          <div class="badge">★ ${m.vote_average ? m.vote_average.toFixed(1) : "–"}</div>
          <p></p>
        </div>
      </div>
      <section class="cast hidden">
        <h4>Szereplők</h4>
        <div class="cast-wrap">
          <button class="cast-btn prev" aria-label="Előző">‹</button>
          <div class="cast-track"></div>
          <button class="cast-btn next" aria-label="Következő">›</button>
        </div>
      </section>`;

    // textContent: így nem kerülhet HTML a címbe/leírásba
    box.querySelector("h3").textContent = m.title;
    box.querySelector("p").textContent =
      m.overview || "Ehhez a filmhez nincs magyar leírás.";

    buildCast(box, m.credits && m.credits.cast);
  } catch (err) {
    box.innerHTML = "<p>Nem sikerült betölteni a részleteket.</p>";
  }
}

/* ---------- Szereplők karusszel ---------- */
const PROFILE = "https://image.tmdb.org/t/p/w185";

function buildCast(box, cast) {
  if (!cast || !cast.length) return;

  const section = box.querySelector(".cast");
  const track = section.querySelector(".cast-track");

  // a TMDB "order" mezője a fontossági sorrend (főszereplő = 0)
  [...cast]
    .sort((a, b) => a.order - b.order)
    .slice(0, 20)
    .forEach((p) => {
      const item = document.createElement("div");
      item.className = "actor";

      let photo;
      if (p.profile_path) {
        photo = document.createElement("img");
        photo.src = PROFILE + p.profile_path;
        photo.alt = p.name;
        photo.loading = "lazy";
      } else {
        photo = document.createElement("div");
        photo.className = "no-photo";
        photo.textContent = "👤";
      }

      const name = document.createElement("strong");
      name.textContent = p.name;

      const role = document.createElement("span");
      role.textContent = p.character || "";

      item.append(photo, name, role);
      track.appendChild(item);
    });

  const step = () => track.clientWidth * 0.8;
  section.querySelector(".prev").addEventListener("click", () =>
    track.scrollBy({ left: -step(), behavior: "smooth" })
  );
  section.querySelector(".next").addEventListener("click", () =>
    track.scrollBy({ left: step(), behavior: "smooth" })
  );

  section.classList.remove("hidden");
}

function closeModal() {
  $("modal").classList.add("hidden");
}
$("modalClose").addEventListener("click", closeModal);
$("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

/* ---------- Indítás ---------- */
if (!TMDB_API_KEY || TMDB_API_KEY.startsWith("IDE_")) {
  showError("Add meg az API kulcsot a config.js fájlban.");
} else {
  loadCategories();
}