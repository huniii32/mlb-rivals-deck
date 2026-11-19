import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
await build({configFile:false,root:resolve('demo/rivals-series'),base:'/rivals-series-demo/',plugins:[react()],envDir:false,define:{'import.meta.env.VITE_SERIES_DEMO':'"1"'},build:{outDir:resolve('dist/rivals-series-demo'),emptyOutDir:true}});
