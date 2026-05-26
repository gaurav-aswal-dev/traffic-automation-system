from abc import ABC, abstractmethod
from collections import deque
from typing import TypeVar, Generic, Optional, Dict, List
import json
import os

T = TypeVar("T")

class Repository(ABC, Generic[T]):
    @abstractmethod
    def add(self, entity: T) -> str:
        pass

    @abstractmethod
    def get(self, entity_id: str) -> Optional[T]:
        pass

    @abstractmethod
    def list_all(self) -> List[T]:
        pass

    @abstractmethod
    def remove(self, entity_id: str) -> Optional[T]:
        pass

    @abstractmethod
    def size(self) -> int:
        pass

    @abstractmethod
    def clear(self) -> None:
        pass

class VehicleRepository(Repository):
    VALID_LANES = ("north", "south", "east", "west")

    def __init__(self):
        self._lanes: Dict[str, deque] = {
            lane: deque() for lane in self.VALID_LANES
        }

        self._index: Dict[str, object] = {}

    def add(self, vehicle) -> str:
        if vehicle.lane not in self.VALID_LANES:
            raise ValueError(f"Invalid lane '{vehicle.lane}'. "
                             f"Must be one of {self.VALID_LANES}")
        self._lanes[vehicle.lane].append(vehicle)
        self._index[vehicle.id] = vehicle
        return vehicle.id

    def get(self, entity_id: str):
        return self._index.get(entity_id)

    def list_all(self) -> list:
        result = []
        for lane_deque in self._lanes.values():
            result.extend(lane_deque)
        return result

    def list_by_lane(self, lane_name: str) -> deque:
        if lane_name not in self._lanes:
            raise ValueError(f"Unknown lane '{lane_name}'")
        return self._lanes[lane_name]

    def remove(self, entity_id: str):
        vehicle = self._index.pop(entity_id, None)
        if vehicle is None:
            return None
        lane_deque = self._lanes.get(vehicle.lane)
        if lane_deque:
            try:
                lane_deque.remove(vehicle)
            except ValueError:
                pass
        return vehicle

    def remove_front(self, lane_name: str):
        lane_deque = self._lanes.get(lane_name)
        if lane_deque:
            vehicle = lane_deque.popleft()
            self._index.pop(vehicle.id, None)
            return vehicle
        return None

    def lane_size(self, lane_name: str) -> int:
        return len(self._lanes.get(lane_name, []))

    def size(self) -> int:
        return sum(len(d) for d in self._lanes.values())

    def clear(self) -> None:
        for d in self._lanes.values():
            d.clear()
        self._index.clear()

    def has_ambulance(self, lane_name: str) -> bool:
        return any(v.type == "ambulance" for v in self._lanes.get(lane_name, []))

    def has_any_ambulance(self) -> bool:
        return any(
            v.type == "ambulance"
            for lane_deque in self._lanes.values()
            for v in lane_deque
        )

    def to_dict(self) -> dict:
        return {
            lane_name: [
                {
                    "id": v.id,
                    "type": v.type,
                    "lane": v.lane,
                    "position": v.position,
                    "destination": v.destination,
                }
                for v in lane_deque
            ]
            for lane_name, lane_deque in self._lanes.items()
        }

    def get_state(self) -> dict:
        return {
            lane_name: [
                {
                    "id": v.id,
                    "type": v.type,
                    "pos": v.position,
                    "entered_intersection": bool(
                        getattr(v, "has_entered_intersection", False)
                    ),
                }
                for v in lane_deque
            ]
            for lane_name, lane_deque in self._lanes.items()
        }

class IntersectionRepository(Repository):
    def __init__(self):
        self._store: Dict[str, object] = {}

    def add(self, intersection) -> str:
        self._store[intersection.name] = intersection
        return intersection.name

    def get(self, entity_id: str):
        return self._store.get(entity_id)

    def list_all(self) -> list:
        return list(self._store.values())

    def remove(self, entity_id: str):
        return self._store.pop(entity_id, None)

    def size(self) -> int:
        return len(self._store)

    def clear(self) -> None:
        self._store.clear()

def save_to_file(vehicle_repo: VehicleRepository, filepath: str) -> None:
    data = vehicle_repo.to_dict()
    os.makedirs(os.path.dirname(filepath) or ".", exist_ok=True)
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2)
