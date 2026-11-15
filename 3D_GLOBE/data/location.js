const locations = [
  {
    id: 1,
    name: "Jezero Crater",
    latitude: 18.38,
    longitude: 77.58,
    type: "landing_science", // Zona de Pouso e Ciência
    riskLevel: "Low",
    color: "#080cea", // Azul ciano (água/ciência)
    description: "Antigo lago deltaico, excelente para recolha de amostras e pesquisa de bioassinaturas."
  },

  {
    id: 2,
    name: "Mare Boreum",
    latitude: 90,
    longitude: 10,
    type: "resource_water", // Recurso de Gelo/Água
    riskLevel: "Medium",
    color: "#080cea", // Verde (Recurso vital / Seguro se equipado)
    description: "Calota polar norte rica em depósitos de água congelada acessível para suporte de vida."
  },

  {
    id: 3,
    name: "Valles Marineris",
    latitude: -14.0,
    longitude: 300.0,
    type: "hazard_terrain", // Zona de Perigo / Terreno Acidentado
    riskLevel: "High",
    color: "#080cea", // Vermelho (Perigo de desfiladeiro/tempestades)
    description: "Sistema colossal de cânions. Apresenta ventos fortes e riscos geológicos, mas rico em minerais."
  },

  {
    id: 4,
    name: "Cratera Vermelha",
    latitude: 18.9,
    longitude: 5.5,
    type: "base_shelter", // Abrigo / Base Segura
    riskLevel: "Low",
    color: "#080cea", // Amarelo (Base / Ponto de Apoio)
    description: "Local estipulado para instalação de módulos habitacionais protegidos contra radiação."
  }
];

export default locations;