import { Delivery, DeliveryStatus } from '../../domain/entities/Delivery';
import { DispatchRequest } from '../../domain/entities/DispatchRequest';

export interface DeliveryDto {
  id: string;
  orderId: string;
  courierId: string;
  status: DeliveryStatus;
}

export interface DispatchRequestDto {
  orderId: string;
  restaurantId: string;
  deliveryAddress: string;
}

export const toDeliveryDto = (d: Delivery): DeliveryDto => ({
  id: d.id,
  orderId: d.orderId,
  courierId: d.courierId,
  status: d.status,
});

export const toDispatchRequestDto = (r: DispatchRequest): DispatchRequestDto => ({
  orderId: r.orderId,
  restaurantId: r.restaurantId,
  deliveryAddress: r.deliveryAddress,
});
