import { MetadataRoute } from 'next'
 
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  return [
    {
      url: 'https://gatita.kro.kr',
      lastModified,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: 'https://gatita.kro.kr/privacy',
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: 'https://gatita.kro.kr/terms',
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ]
}
