export function validateTripForm(data) {
  const errors = {};

  if (!data.name || data.name.trim().length < 3) {
    errors.name = 'Indique um nome de missão com pelo menos 3 caracteres.';
  }

  if (!data.originId) {
    errors.originId = 'Selecione o local de partida.';
  }

  if (!data.destinationId) {
    errors.destinationId = 'Selecione o destino em Marte.';
  } else if (data.originId && data.destinationId === data.originId) {
    errors.destinationId = 'O destino deve ser diferente do local de partida.';
  }

  if (!data.departureDate) {
    errors.departureDate = 'Indique a data de partida.';
  }

  if (!data.arrivalDate) {
    errors.arrivalDate = 'Indique a data prevista de chegada.';
  } else if (data.departureDate && data.arrivalDate < data.departureDate) {
    errors.arrivalDate = 'A data de chegada deve ser igual ou posterior à partida.';
  }

  const crew = Number(data.participants);
  if (!Number.isInteger(crew) || crew < 1 || crew > 50) {
    errors.participants = 'O número de participantes deve situar-se entre 1 e 50.';
  }

  if (!data.missionType) {
    errors.missionType = 'Selecione o tipo de missão.';
  }

  if (!data.objective || data.objective.trim().length < 8) {
    errors.objective = 'Descreva o objetivo da exploração (mínimo 8 caracteres).';
  }

  if (!data.riskTolerance) {
    errors.riskTolerance = 'Selecione o nível de risco permitido.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateChatMessage(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) {
    return { isValid: false, error: 'Escreva uma mensagem antes de enviar.' };
  }
  if (trimmed.length > 800) {
    return { isValid: false, error: 'A mensagem não pode exceder 800 caracteres.' };
  }
  return { isValid: true, value: trimmed };
}
