import { MetadataRoute } from 'next'
 
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  return [
    {
      url: 'https://gatitagachon.vercel.app',
      lastModified,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: 'https://gatitagachon.vercel.app/privacy',
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: 'https://gatitagachon.vercel.app/terms',
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ]
}
