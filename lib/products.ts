import { Product } from './app-context'

export const PRODUCTS: Product[] = []

export const CATEGORIES = [
  {
    name: 'Women',
    id: 'women',
    description: 'Traditional and modern silk sarees and attires',
    image: 'https://cdn.uconnectlabs.com/wp-content/uploads/sites/3/2021/04/business-formal-outfit.jpg'
  },
  {
    name: 'Men',
    id: 'men',
    description: 'Elegant formal and casual silk menswear',
    image: 'https://thevou.com/wp-content/uploads/2025/06/two-piece-Business-Professional-suit.jpg'
  },
  {
    name: 'Girls',
    id: 'girls',
    description: 'Colorful traditional lehengas and ethnic wear',
    image: 'https://img.freepik.com/premium-photo/cute-little-girls-picture-ai-generated_1003721-473.jpg'
  },
  {
    name: 'Boys',
    id: 'boys',
    description: 'Stylish traditional kurtas and festival sets',
    image: 'https://static.vecteezy.com/system/resources/thumbnails/033/334/060/small_2x/cute-boy-wearing-blank-empty-white-t-shirt-mockup-for-design-template-ai-generated-free-photo.jpg'
  },
]

export const getProductsByCategory = (category?: string) => {
  if (!category) return PRODUCTS
  return PRODUCTS.filter(p => p.category === category)
}

export const getProductById = (id: string) => {
  return PRODUCTS.find(p => p.id === id)
}

export const getFeaturedProducts = () => {
  return PRODUCTS.filter(p => p.rating >= 4.7).slice(0, 8)
}
