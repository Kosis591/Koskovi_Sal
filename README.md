# Koskovi Sal

Next.js aplikace pro dostupnost a rezervace tanecniho salu.

## Lokalni vyvoj

```bash
npm install
npm run dev
```

Stranka bezi na [http://localhost:3000](http://localhost:3000).

Prikaz `npm run dev` pred startem automaticky smaze slozku `.next`, aby se nemichala vyvojova cache s produkcnim buildem.

## Produkcni build

```bash
npm run build
npm run start
```

Build si take nejprve vycisti `.next`. Prikaz `npm run start` uz `.next` nemaze, protoze ji v produkci potrebuje.

## Rucni vycisteni cache

Kdyz se Next.js zasekne na chybe typu chybejici `routes-manifest.json`, `pages-manifest.json` nebo podivne cache po buildu, spust:

```bash
npm run clean
npm run dev
```

Skript maze jen slozku `.next` v koreni projektu.

## Hashovani hesel

```bash
npm run hash-password -- "tvoje-heslo"
```

Vystup vloz do odpovidajici promenne v `.env.local`.
