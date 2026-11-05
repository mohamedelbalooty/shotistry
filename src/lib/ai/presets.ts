import type { PhotoshootPreset } from '../types/index.ts';

export const REGIONAL_PHOTOSHOOT_PRESETS: PhotoshootPreset[] = [
  {
    id: 'gulf_luxury_marble',
    name: 'Gulf Luxury — Black Marble & Brass',
    nameAr: 'الفخامة الخليجية - رخام أسود ونحاس',
    category: 'fragrances',
    descriptionEn: 'Opulent dark Italian Marquina marble podium with warm brass accents and refined architectural lighting.',
    descriptionAr: 'منصة فاخرة من الرخام الإيطالي الأسود مع لمسات نحاسية وإضاءة معمارية دافئة تليق بالعطور الفاخرة.',
    thumbnailUrl: '/presets/gulf-luxury.jpg',
    isRegional: true,
    baseSchema: {
      surface: 'circular polished Nero Marquina black marble pedestal with subtle white veining and mirror reflection',
      backdrop: 'minimalist limestone architectural wall with warm cove illumination and clean ambient depth',
      lighting: 'dual studio softboxes, 45-degree warm brass rim lighting highlighting edges, soft contact shadow',
      cameraLens: 'medium-format Hasselblad 90mm tilt-shift lens, commercial luxury advertising aesthetic',
      depthOfField: 'sharp f/5.6 focus on product label and contours, smooth gradual bokeh falloff in background',
      colorGrading: 'rich dark luxury tones, deep black contrast, warm brass and gold specular highlights',
      props: 'subtle brushed brass geometric cubes, dry oud wood chips softly blurred in background',
      physicalCoherence: 'grounded ambient occlusion contact shadow, true-to-life surface light bounce',
      negativeDirectives: 'no warped bottle geometry, no fake text, no low resolution artifacts, no floating props'
    }
  },
  {
    id: 'desert_sunset_dunes',
    name: 'Arabian Desert Dunes at Twilight',
    nameAr: 'كثبان الصحراء وقت الغروب',
    category: 'fragrances',
    descriptionEn: 'Natural sandstone block nestled in undulating golden desert dunes bathed in warm twilight sun.',
    descriptionAr: 'كتلة من الحجر الرملي الطبيعي وسط كثبان الصحراء الذهبية المتموجة تحت شمس الغروب الدافئة.',
    thumbnailUrl: '/presets/desert-dunes.jpg',
    isRegional: true,
    baseSchema: {
      surface: 'rough-hewn natural desert sandstone rock slab firmly set into fine golden sand',
      backdrop: 'softly undulating golden sand ripples under a tranquil amber and lavender twilight desert horizon',
      lighting: 'low-angle golden hour directional sunlight casting long dramatic warm shadows and glowing contours',
      cameraLens: '85mm f/1.4 prime portrait lens, eye-level heroic commercial perspective',
      depthOfField: 'crisp product isolation, dreamy cinematic sand dune blur in distant background',
      colorGrading: 'warm terracotta, amber, desert gold, and deep bronze atmospheric saturation',
      props: 'fine natural sand grains, gentle desert breeze haze',
      physicalCoherence: 'natural sand displacement around rock base, true contact shadows',
      negativeDirectives: 'no distorted product shape, no oversaturated cartoonish colors, no blurry edges'
    }
  },
  {
    id: 'botanical_spa_splash',
    name: 'Pure Botanical & Dewy Water Splash',
    nameAr: 'الطبيعة النقية ورذاذ الماء',
    category: 'cosmetics',
    descriptionEn: 'Crystal-clear water ripples with frozen droplet splashes, framed by dewy botanical leaves.',
    descriptionAr: 'تموجات ماء نقية مع رذاذ قطرات متناثرة وأوراق نباتية خضراء نضرة للعناية بالبشرة ومستحضرات التجميل.',
    thumbnailUrl: '/presets/botanical-splash.jpg',
    isRegional: false,
    baseSchema: {
      surface: 'shallow crystal-clear water surface with delicate concentric ripples and glass-like clarity',
      backdrop: 'soft out-of-focus morning sunlit botanical greenhouse with organic diffuse white and mint green tones',
      lighting: 'bright diffuse natural morning daylight, sparkling caustic patterns dancing on water surface',
      cameraLens: '100mm macro lens, ultra-high-speed shutter freezing micro water droplets in mid-air',
      depthOfField: 'pin-sharp focus on product details, soft watercolor bokeh across perimeter foliage',
      colorGrading: 'fresh, clean, vibrant pastel greens, pure white balance, crystal aqua transparency',
      props: 'dewy aloe vera cutting and fresh eucalyptus leaves softly accenting the edge',
      physicalCoherence: 'true water surface reflection, refraction of bottom light through liquid, realistic splash dynamics',
      negativeDirectives: 'no murky water, no plastic artificial leaves, no logo alteration'
    }
  },
  {
    id: 'minimalist_concrete_studio',
    name: 'Contemporary Minimalist Studio',
    nameAr: 'استوديو معماري معاصر',
    category: 'apparel',
    descriptionEn: 'Smooth concrete plinth against an ivory architectural wall with geometric window shadows.',
    descriptionAr: 'منصة خرسانية ملساء أمام جدار عاجي أنيق مع ظلال معمارية ناعمة لكتالوجات الموضة والحقائب.',
    thumbnailUrl: '/presets/minimalist-studio.jpg',
    isRegional: false,
    baseSchema: {
      surface: 'smooth matte light grey concrete rectangular plinth with clean beveled edges',
      backdrop: 'monochromatic warm ivory architectural studio wall with soft geometric window shadow patterns',
      lighting: 'large wrap-around softbox key light from left, subtle white bounce card fill eliminating harsh contrast',
      cameraLens: '50mm prime studio lens, straight-on commercial product height',
      depthOfField: 'deep f/8 aperture ensuring end-to-end edge sharpness and tactile material texture fidelity',
      colorGrading: 'neutral, balanced color temperature preserving exact fabric and leather dye accuracy',
      props: 'none, ultra-clean distraction-free commercial catalog presentation',
      physicalCoherence: 'accurate grounding contact shadow directly beneath product base',
      negativeDirectives: 'no cluttered props, no unnatural color cast, no distortion of textures'
    }
  },
  {
    id: 'ramadan_eid_heritage',
    name: 'Ramadan & Eid Heritage Glow',
    nameAr: 'أجواء رمضان والعيد التراثية',
    category: 'seasonal',
    descriptionEn: 'Warm celebratory walnut wood arrangement with an ornate brass lantern casting geometric light.',
    descriptionAr: 'ترتيب احتفالي دافئ على خشب الجوز الفاخر مع فانوس نحاسي تراثي يضفي لمسات رمضانية ساحرة.',
    thumbnailUrl: '/presets/ramadan-eid.jpg',
    isRegional: true,
    baseSchema: {
      surface: 'rich dark walnut carved wood table with subtle mother-of-pearl inlays and satin finish',
      backdrop: 'textured heritage wall illuminated by warm candlelit glow and soft arabesque geometric shadow tracery',
      lighting: 'warm ambient lantern key light, flickering candlelight rim accents, soft deep shadows',
      cameraLens: '85mm prime lens, cinematic shallow depth of field',
      depthOfField: 'razor-sharp product hero, ornate brass Fanous lantern forming creamy circular bokeh in background',
      colorGrading: 'warm golden candlelight, deep amber, antique bronze, and rich festive evening hues',
      props: 'traditional antique brass lantern, silver filigree bowl with gourmet Saudi dates softly out of focus',
      physicalCoherence: 'authentic light falloff from lantern, contact table reflection',
      negativeDirectives: 'no modern synthetic props, no neon lighting, no text alteration'
    }
  }
];

export function getPresetById(id: string): PhotoshootPreset {
  const preset = REGIONAL_PHOTOSHOOT_PRESETS.find((p) => p.id === id);
  if (!preset) {
    return REGIONAL_PHOTOSHOOT_PRESETS[0]; // Default to Gulf Luxury
  }
  return preset;
}
