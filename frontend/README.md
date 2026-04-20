# SnapBulance Frontend

React + Vite frontend written in JavaScript/JSX.

## Scripts

- `npm run dev` starts the Vite dev server.
- `npm run build` creates a production build.
- `npm run preview` previews the production build locally.

## Deploy To Vercel

1. Import the `frontend` folder as a Vercel project.
2. Keep the default framework preset as `Vite`.
3. Set the project root directory to `frontend`.
4. Add this environment variable in Vercel:
   - `VITE_API_URL=https://snap-bulance-backend.onrender.com`
5. Deploy.

### Important Backend Setting

After you get your Vercel production domain, add it to the Render backend CORS allowlist in the backend environment:

- `REACT_PROD_URL=https://your-vercel-domain.vercel.app`

If you already use a custom frontend domain, put that URL there instead.
