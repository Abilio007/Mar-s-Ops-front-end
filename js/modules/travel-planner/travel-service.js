import { appState, getRegionById, notifyIfEnabled } from '../../core/state.js';
import { backendApi } from '../../core/backend-api.js';
import { calculateRouteMetrics } from '../../utils/helpers.js';

export const travelService = {
  getAll() {
    return appState.trips;
  },

  getById(id) {
    return appState.trips.find((t) => t.id === id) || null;
  },

  getByStatus(status) {
    return appState.trips.filter((t) => t.status === status);
  },

  computeRouteSummary(originId, destinationId, waypoints = []) {
    const orderedIds = [originId, ...(waypoints || []), destinationId].filter(Boolean);
    const regions = orderedIds.map((id) => getRegionById(id));
    const metrics = calculateRouteMetrics(regions, appState.catalog.cruiseSpeedKmPerHour);
    const relatedAlerts = appState.alerts.filter((a) => orderedIds.includes(a.regionId));

    return {
      orderedIds,
      regions,
      distanceKm: metrics.distanceKm,
      estimatedDays: metrics.durationDays,
      estimatedHours: metrics.durationHours,
      relatedAlerts,
    };
  },

  getDefaultEquipment(missionType) {
    return appState.catalog.equipmentByMissionType?.[missionType] || [];
  },

  buildSchedule(trip) {
    return [
      { phase: 'Preparação e Inspeção', date: trip.departureDate, status: trip.status === 'planned' ? 'Pendente' : 'Concluída' },
      { phase: 'Partida de ' + getRegionById(trip.originId).name, date: trip.departureDate, status: trip.status === 'planned' ? 'Agendada' : 'Concluída' },
      {
        phase: trip.waypoints?.length ? `Passagem por ${trip.waypoints.map((w) => getRegionById(w).name).join(', ')}` : 'Travessia de Cruzeiro',
        date: trip.departureDate,
        status: trip.status === 'completed' ? 'Concluída' : trip.status === 'active' ? 'Em Curso' : 'Agendada',
      },
      { phase: 'Chegada a ' + getRegionById(trip.destinationId).name, date: trip.arrivalDate, status: trip.status === 'completed' ? 'Concluída' : 'Prevista' },
    ];
  },

  async saveTrip(formData, existingId = null) {
    const savedTrip = existingId
      ? await backendApi.updateMission(existingId, formData)
      : await backendApi.createMission(formData);
    const idx = appState.trips.findIndex((trip) => trip.id === savedTrip.id);
    if (idx === -1) appState.trips.unshift(savedTrip);
    else appState.trips[idx] = savedTrip;

    notifyIfEnabled('tripUpdates', {
      title: existingId ? 'Viagem Atualizada' : 'Missão Criada',
      message: `${savedTrip.name} guardada no servidor.`,
      variant: 'safe',
    });

    return savedTrip;
  },

  async deleteTrip(tripId) {
    const target = this.getById(tripId);
    if (!target) return;
    await backendApi.deleteMission(tripId);
    appState.trips = appState.trips.filter((t) => t.id !== tripId);
    notifyIfEnabled('tripUpdates', {
      title: 'Viagem Eliminada',
      message: `${target.name} foi removida.`,
      variant: 'info',
    });
  },

  async updateStatus(tripId, nextStatus) {
    const trip = this.getById(tripId);
    if (!trip) return;
    const updated = await backendApi.updateMissionStatus(tripId, nextStatus);
    appState.trips[appState.trips.findIndex((item) => item.id === tripId)] = updated;
    notifyIfEnabled('missionMilestones', {
      title: 'Estado da Missão Atualizado',
      message: `${trip.name} está agora ${nextStatus === 'active' ? 'Em Andamento' : nextStatus === 'completed' ? 'Concluída' : 'Planeada'}.`,
      variant: 'safe',
    });
    return updated;
  },

  async toggleChecklistItem(tripId, itemId) {
    const trip = this.getById(tripId);
    if (!trip || !Array.isArray(trip.checklist)) return;
    const item = trip.checklist.find((c) => c.id === itemId);
    if (item) {
      const updated = await backendApi.updateMissionChecklistItem(tripId, itemId, !item.done);
      appState.trips[appState.trips.findIndex((current) => current.id === tripId)] = updated;
      return updated;
    }
  },
};
